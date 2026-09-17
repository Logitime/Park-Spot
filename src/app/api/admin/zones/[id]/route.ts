import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1, "Zone name is required").max(80).optional(),
  floor: z.coerce.number().int().min(-10).max(200).optional(),
  priceMultiplier: z.coerce.number().min(0).max(10).optional(),
});

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/zones/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.zone.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
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
  if (parsed.data.floor !== undefined) data.floor = parsed.data.floor;
  if (parsed.data.priceMultiplier !== undefined) {
    data.priceMultiplier = parsed.data.priceMultiplier;
  }

  const zone = await prisma.zone.update({ where: { id }, data });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "ZONE_UPDATED",
    details: `zone=${zone.id} name="${zone.name}" floor=${zone.floor} multiplier=${zone.priceMultiplier}`,
  });

  return NextResponse.json({ zone });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/zones/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.zone.findUnique({
    where: { id },
    include: { _count: { select: { spots: true, gates: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }

  if (existing._count.spots > 0) {
    return NextResponse.json(
      {
        error: `Zone has ${existing._count.spots} spot(s). Move or remove them before deleting this zone.`,
      },
      { status: 400 }
    );
  }

  await prisma.zone.delete({ where: { id } });
  // gates referencing this zone get zoneId = null via onDelete: SetNull

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "ZONE_DELETED",
    details: `zone=${id} name="${existing.name}"`,
  });

  return NextResponse.json({ ok: true });
}