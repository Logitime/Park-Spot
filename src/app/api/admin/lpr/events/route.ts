import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 300;

const eventSchema = z.object({
  kind: z.string().min(1).max(64),
  lane: z.string().max(64).default(""),
  direction: z.string().max(16).default("ENTRY"),
  state: z.string().max(32).default(""),
  plate: z.string().max(64).default(""),
  confidence: z.number().min(0).max(1).default(0),
  reason: z.string().max(256).default(""),
  action: z.string().max(16).default(""),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 60);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 60, 1), MAX_LIMIT);
  const lane = request.nextUrl.searchParams.get("lane")?.trim() || undefined;

  const events = await prisma.lprEvent.findMany({
    where: lane ? { lane } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    events: events.map((ev) => ({
      id: ev.id,
      lane: ev.lane,
      direction: ev.direction,
      kind: ev.kind,
      state: ev.state,
      plate: ev.plate,
      confidence: ev.confidence,
      reason: ev.reason,
      action: ev.action,
      payload: ev.payload ? (JSON.parse(ev.payload) as Record<string, unknown>) : null,
      createdAt: ev.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body as { events?: unknown })?.events;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "events array is required" }, { status: 400 });
  }

  const results = raw.map((e) => eventSchema.safeParse(e));
  if (results.some((r) => !r.success)) {
    return NextResponse.json(
      { error: "One or more events are invalid" },
      { status: 400 }
    );
  }

  const values = [];
  for (const r of results) {
    if (!r.success) continue;
    const p = r.data;
    values.push({
      kind: p.kind,
      lane: p.lane,
      direction: p.direction,
      state: p.state,
      plate: p.plate,
      confidence: p.confidence,
      reason: p.reason,
      action: p.action,
      payload: p.payload ? JSON.stringify(p.payload) : null,
    });
  }

  const created = await prisma.lprEvent.createMany({ data: values });
  return NextResponse.json({ accepted: created.count }, { status: 201 });
}

export async function DELETE() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cleared = await prisma.lprEvent.deleteMany({});
  return NextResponse.json({ cleared: cleared.count });
}