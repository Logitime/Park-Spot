import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lots = await prisma.parkingLot.findMany({
    orderBy: { name: "asc" },
    include: {
      zones: {
        orderBy: [{ floor: "asc" }, { name: "asc" }],
        include: {
          spots: {
            orderBy: { number: "asc" },
            select: {
              id: true,
              number: true,
              status: true,
              size: true,
              evCharging: true,
              accessible: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    lots: lots.map((lot) => {
      const all = lot.zones.flatMap((z) => z.spots);
      const count = (status: string) =>
        all.filter((s) => s.status === status).length;
      const available = count("AVAILABLE");
      const occupied = count("OCCUPIED");
      const reserved = count("RESERVED");
      return {
        id: lot.id,
        name: lot.name,
        total: all.length,
        available,
        occupied,
        reserved,
        occupancyPct: all.length
          ? Math.round(((occupied + reserved) / all.length) * 100)
          : 0,
        zones: lot.zones.map((z) => ({
          id: z.id,
          name: z.name,
          floor: z.floor,
          available: z.spots.filter((s) => s.status === "AVAILABLE").length,
          occupied: z.spots.filter((s) => s.status === "OCCUPIED").length,
          reserved: z.spots.filter((s) => s.status === "RESERVED").length,
          spots: z.spots,
        })),
      };
    }),
  });
}