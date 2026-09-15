import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maybeRunSweep } from "@/lib/maintenance-sweep";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  await maybeRunSweep();

  const searchParams = request.nextUrl.searchParams;
  const lotId = searchParams.get("lotId");
  const zoneId = searchParams.get("zoneId");
  const sizes = searchParams.getAll("size");
  const status = searchParams.get("status");
  const evCharging = searchParams.get("evCharging");
  const accessible = searchParams.get("accessible");
  const maxPrice = searchParams.get("maxPrice");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);

  const where: Prisma.SpotWhereInput = {};

  if (lotId) where.zone = { lotId };
  if (zoneId) where.zoneId = zoneId;
  if (sizes.length > 0) where.size = { in: sizes };
  if (status) where.status = status;
  if (evCharging === "true") where.evCharging = true;
  if (accessible === "true") where.accessible = true;
  if (maxPrice) where.pricePerHour = { lte: Number(maxPrice) };

  const spots = await prisma.spot.findMany({
    where,
    take: limit,
    orderBy: [{ zone: { floor: "asc" } }, { number: "asc" }],
    include: {
      zone: {
        include: {
          lot: { select: { id: true, name: true, address: true, baseHourlyRate: true, evChargingRate: true } },
        },
      },
    },
  });

  return NextResponse.json({ spots });
}