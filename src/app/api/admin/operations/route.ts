import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const reservationInclude = {
  user: { select: { id: true, name: true, email: true } },
  vehicle: { select: { plateNumber: true, type: true } },
  spot: {
    include: {
      zone: { include: { lot: { select: { id: true, name: true } } } },
    },
  },
};

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  const [onSite, expected, breach, lots, feed] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: "ACTIVE" },
      orderBy: { startTime: "asc" },
      include: reservationInclude,
    }),
    prisma.reservation.findMany({
      where: {
        status: "CONFIRMED",
        startTime: { gte: now, lte: new Date(now.getTime() + 24 * 3600_000) },
      },
      orderBy: { startTime: "asc" },
      include: reservationInclude,
    }),
    prisma.reservation.findMany({
      where: { status: "ACTIVE", endTime: { lt: now } },
      orderBy: { endTime: "asc" },
      include: reservationInclude,
    }),
    prisma.parkingLot.findMany({
      include: {
        zones: {
          include: { spots: { select: { id: true, status: true } } },
        },
      },
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
  ]);

  const sites = {
    onSiteCount: onSite.length,
    onSite,
    expectedCount: expected.length,
    expected,
    breachCount: breach.length,
    breach,
    feed,
    timestamp: now.toISOString(),
    lots: lots.map((lot) => {
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
        occupancyPct: total ? Math.round((occupied / total) * 100) : 0,
      };
    }),
  };

  return NextResponse.json(sites);
}