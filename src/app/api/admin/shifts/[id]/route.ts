import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateSchema = z.object({
  name: z.string().min(1, "Shift name is required").max(80).optional(),
  startTime: z.string().regex(TIME_RE, "Start time must be HH:MM").optional(),
  endTime: z.string().regex(TIME_RE, "End time must be HH:MM").optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/shifts/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.startTime !== undefined) data.startTime = parsed.data.startTime;
  if (parsed.data.endTime !== undefined) data.endTime = parsed.data.endTime;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;

  const shift = await prisma.shift.update({ where: { id }, data });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "SHIFT_UPDATED",
    details: `shift=${shift.id} name="${shift.name}" ${shift.startTime}-${shift.endTime} enabled=${shift.enabled}`,
  });

  return NextResponse.json({ shift });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/shifts/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  await prisma.shift.delete({ where: { id } });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "SHIFT_DELETED",
    details: `shift=${id} name="${existing.name}"`,
  });

  return NextResponse.json({ ok: true });
}