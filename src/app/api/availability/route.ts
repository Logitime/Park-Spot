import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const lots = await prisma.parkingLot.findMany({
    select: { id: true, name: true, totalSpots: true },
  });

  const payload = await Promise.all(
    lots.map(async (lot) => {
      const [available, occupied, reserved] = await Promise.all([
        prisma.spot.count({ where: { zone: { lotId: lot.id }, status: "AVAILABLE" } }),
        prisma.spot.count({ where: { zone: { lotId: lot.id }, status: "OCCUPIED" } }),
        prisma.spot.count({ where: { zone: { lotId: lot.id }, status: "RESERVED" } }),
      ]);

      const zones = await prisma.zone.findMany({
        where: { lotId: lot.id },
        select: {
          id: true,
          name: true,
          floor: true,
          _count: { select: { spots: true } },
        },
      });

      const zonesWithCounts = await Promise.all(
        zones.map(async (zone) => ({
          ...zone,
          available: await prisma.spot.count({
            where: { zoneId: zone.id, status: "AVAILABLE" },
          }),
        }))
      );

      return {
        lotId: lot.id,
        name: lot.name,
        total: lot.totalSpots,
        available,
        occupied,
        reserved,
        occupancyPct: Math.round(((occupied + reserved) / lot.totalSpots) * 100),
        zones: zonesWithCounts,
      };
    })
  );

  return NextResponse.json({ availability: payload });
}