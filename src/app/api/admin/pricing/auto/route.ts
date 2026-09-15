import { NextRequest, NextResponse } from "next/server";
import { z as zod } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { getPolicy, logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

interface LotOccupancy {
  id: string;
  name: string;
  total: number;
  occupied: number;
  reserved: number;
  free: number;
  occupancyPct: number;
}

async function computeOccupancy(): Promise<LotOccupancy[]> {
  const lots = await prisma.parkingLot.findMany({
    include: {
      zones: { include: { spots: { select: { status: true } } } },
    },
  });
  return lots.map((lot) => {
    const spots = lot.zones.flatMap((z) => z.spots);
    const occupied = spots.filter((s) => s.status === "OCCUPIED").length;
    const reserved = spots.filter((s) => s.status === "RESERVED").length;
    const total = spots.length;
    return {
      id: lot.id,
      name: lot.name,
      total,
      occupied,
      reserved,
      free: Math.max(0, total - occupied - reserved),
      occupancyPct: total ? Math.round(((occupied + reserved) / total) * 100) : 0,
    };
  });
}

function computeRecommended(
  pct: number,
  highThreshold: number,
  min: number,
  max: number
): number {
  if (pct < highThreshold * 0.7) return 1;
  const span = highThreshold;
  const t = Math.max(0, (pct - span * 0.7) / (span * 0.3));
  const raw = 1 + t * (max - 1);
  return Math.round(Math.min(max, Math.max(1, raw)) * 100) / 100;
}

interface PreviewZone {
  zoneId: string;
  zoneName: string;
  recommendedMultiplier: number;
  currentMultiplier: number;
  surgeActive: boolean;
}

interface PreviewLot {
  id: string;
  name: string;
  occupancyPct: number;
  total: number;
  occupied: number;
  reserved: number;
  free: number;
  zones: PreviewZone[];
}

async function buildPreview() {
  const policy = await getPolicy();
  const occupancy = await computeOccupancy();
  const byLot = new Map(occupancy.map((o) => [o.id, o]));

  const zones = await prisma.zone.findMany({
    include: { lot: { select: { id: true, name: true } } },
  });

  const activeRules = await prisma.pricingRule.findMany({
    where: { name: "auto-surge" },
  });
  const activeByZone = new Map(activeRules.map((r) => [r.zoneId, r]));

  const lots = zones.reduce<Record<string, PreviewLot>>((acc, z) => {
    const lot = byLot.get(z.lotId);
    if (!lot) return acc;
    const entry = (acc[z.lotId] ??= {
      id: z.lotId,
      name: z.lot.name,
      occupancyPct: lot.occupancyPct,
      total: lot.total,
      occupied: lot.occupied,
      reserved: lot.reserved,
      free: lot.free,
      zones: [],
    });
    const recommended = computeRecommended(
      lot.occupancyPct,
      policy.surgeHighOccupancy,
      policy.surgeMinMultiplier,
      policy.surgeMaxMultiplier
    );
    const active = activeByZone.get(z.id);
    entry.zones.push({
      zoneId: z.id,
      zoneName: z.name,
      recommendedMultiplier: recommended,
      currentMultiplier: active?.multiplier ?? 1,
      surgeActive: Boolean(active),
    });
    return acc;
  }, {});

  return {
    policy: {
      highOccupancyThreshold: policy.surgeHighOccupancy,
      minMultiplier: policy.surgeMinMultiplier,
      maxMultiplier: policy.surgeMaxMultiplier,
    },
    generatedAt: new Date().toISOString(),
    lots: Object.values(lots),
  };
}

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await buildPreview());
}

const applySchema = zod.object({
  lotId: zod.string().optional(),
  multiplier: zod.number().min(0.1).max(5).optional(),
});

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
    body = {};
  }
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const policy = await getPolicy();
  const occupancy = await computeOccupancy();
  const targets = parsed.data.lotId
    ? occupancy.filter((o) => o.id === parsed.data.lotId)
    : occupancy;

  const hour = new Date().getHours();
  const applied: { lotId: string; lotName: string; zones: number; multiplier: number }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const lot of targets) {
      const multiplier =
        parsed.data.multiplier ??
        computeRecommended(
          lot.occupancyPct,
          policy.surgeHighOccupancy,
          policy.surgeMinMultiplier,
          policy.surgeMaxMultiplier
        );
      if (multiplier <= 1) continue;

      const zones = await prisma.zone.findMany({
        where: { lotId: lot.id },
        include: { lot: { select: { name: true } } },
      });
      let zoneCount = 0;
      for (const zone of zones) {
        const existing = await tx.pricingRule.findFirst({
          where: {
            zoneId: zone.id,
            name: "auto-surge",
            dayOfWeek: null,
            startHour: hour,
          },
        });
        if (existing) {
          await tx.pricingRule.update({
            where: { id: existing.id },
            data: { multiplier },
          });
        } else {
          await tx.pricingRule.create({
            data: {
              zoneId: zone.id,
              name: "auto-surge",
              dayOfWeek: null,
              startHour: hour,
              endHour: hour + 1,
              multiplier,
            },
          });
        }
        await tx.pricingEvent.create({
          data: {
            zoneId: zone.id,
            action: "APPLY",
            multiplierBefore: existing?.multiplier ?? 1,
            multiplierAfter: multiplier,
            reason: `auto-surge (lot occupancy ${lot.occupancyPct}%)`,
            createdById: session.userId,
            createdByRole: session.role,
          },
        });
        zoneCount++;
      }
      if (zoneCount > 0) {
        applied.push({ lotId: lot.id, lotName: zones[0]?.lot.name ?? lot.id, zones: zoneCount, multiplier });
      }
    }
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "AUTO_SURGE_APPLY",
    details: applied.map((a) => `${a.lotName}:x${a.multiplier}(${a.zones}z)`).join(", ") || "none",
  });

  return NextResponse.json({ applied, preview: await buildPreview() });
}

export async function DELETE() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rules = await prisma.pricingRule.findMany({ where: { name: "auto-surge" } });
  await prisma.$transaction(async (tx) => {
    for (const rule of rules) {
      await tx.pricingEvent.create({
        data: {
          zoneId: rule.zoneId,
          action: "ROLLBACK",
          multiplierBefore: rule.multiplier,
          multiplierAfter: 1,
          reason: "operator rollback",
          createdById: session.userId,
          createdByRole: session.role,
        },
      });
      await tx.pricingRule.delete({ where: { id: rule.id } });
    }
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "AUTO_SURGE_ROLLBACK",
    details: `removed ${rules.length} auto-surge rule(s)`,
  });

  return NextResponse.json({ removed: rules.length, preview: await buildPreview() });
}