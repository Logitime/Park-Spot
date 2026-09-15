import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const lots = await prisma.parkingLot.findMany({
    include: {
      zones: {
        include: {
          _count: { select: { spots: true } },
        },
      },
      _count: { select: { zones: true } },
    },
    orderBy: { name: "asc" },
  });

  const lotsWithAvailability = await Promise.all(
    lots.map(async (lot) => {
      const available = await prisma.spot.count({
        where: { zone: { lotId: lot.id }, status: "AVAILABLE" },
      });
      return { ...lot, available };
    })
  );

  return NextResponse.json({ lots: lotsWithAvailability });
}