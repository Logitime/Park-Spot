import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ruleSchema = z.object({
  zoneId: z.string().min(1),
  name: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  multiplier: z.number().min(0).max(10),
});

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const zones = await prisma.zone.findMany({
    include: {
      lot: { select: { id: true, name: true } },
      pricingRules: { orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }] },
      _count: { select: { spots: true } },
    },
    orderBy: [{ lot: { name: "asc" } }, { floor: "asc" }],
  });

  return NextResponse.json({
    dayNames: DAY_NAMES,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      floor: z.floor,
      priceMultiplier: z.priceMultiplier,
      lot: z.lot,
      spotCount: z._count.spots,
      rules: z.pricingRules.map((r) => ({
        id: r.id,
        name: r.name,
        dayOfWeek: r.dayOfWeek,
        startHour: r.startHour,
        endHour: r.endHour,
        multiplier: r.multiplier,
      })),
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

  const parsed = ruleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  if (parsed.data.endHour <= parsed.data.startHour) {
    return NextResponse.json(
      { error: "End hour must be after start hour" },
      { status: 400 }
    );
  }

  const zone = await prisma.zone.findUnique({
    where: { id: parsed.data.zoneId },
  });
  if (!zone) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  const rule = await prisma.pricingRule.create({
    data: {
      zoneId: parsed.data.zoneId,
      name: parsed.data.name,
      dayOfWeek: parsed.data.dayOfWeek ?? null,
      startHour: parsed.data.startHour,
      endHour: parsed.data.endHour,
      multiplier: parsed.data.multiplier,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}