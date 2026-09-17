import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftSelect = {
  id: true,
  name: true,
  startTime: true,
  endTime: true,
  enabled: true,
  createdAt: true,
  assignments: {
    select: {
      id: true,
      userId: true,
      gateId: true,
      user: { select: { id: true, name: true, email: true, role: true } },
      gate: { select: { id: true, name: true, direction: true, lot: { select: { id: true, name: true } } } },
    },
  },
} as const;

const bodySchema = z.object({
  name: z.string().min(1, "Shift name is required").max(80),
  startTime: z.string().regex(TIME_RE, "Start time must be HH:MM"),
  endTime: z.string().regex(TIME_RE, "End time must be HH:MM"),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shifts = await prisma.shift.findMany({
    select: shiftSelect,
    orderBy: [{ startTime: "asc" }],
  });

  return NextResponse.json({ shifts });
}

export async function POST(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { name, startTime, endTime, enabled } = parsed.data;

  const shift = await prisma.shift.create({
    data: { name, startTime, endTime, enabled: enabled !== false },
    select: shiftSelect,
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "SHIFT_CREATED",
    details: `shift=${shift.id} name="${shift.name}" ${shift.startTime}-${shift.endTime}`,
  });

  return NextResponse.json({ shift }, { status: 201 });
}