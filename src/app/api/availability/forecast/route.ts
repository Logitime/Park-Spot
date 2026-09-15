import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HOURS = 6;
const LOOKBACK_DAYS = 14;

interface HourForecast {
  hour: string;
  label: string;
  predictedAvailable: number;
  predictedOccupancyPct: number;
  confidence: "high" | "medium" | "low";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: NextRequest) {
  const lotId = request.nextUrl.searchParams.get("lotId");
  if (!lotId) {
    return NextResponse.json(
      { error: "lotId query parameter is required" },
      { status: 400 }
    );
  }

  const lot = await prisma.parkingLot.findUnique({
    where: { id: lotId },
    include: { zones: true },
  });
  if (!lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }
  if (lot.zones.length === 0) {
    return NextResponse.json({ error: "Lot has no zones" }, { status: 404 });
  }

  const now = new Date();
  const nowMs = now.getTime();

  const nowOccupied = await prisma.spot.count({
    where: { zone: { lotId }, status: { in: ["OCCUPIED", "RESERVED"] } },
  });

  const horizon = new Date(nowMs + HOURS * 60 * 60 * 1000);

  // Reservations that will occupy a spot in [now, horizon] (start < bucket end).
  const scheduled = await prisma.reservation.findMany({
    where: {
      spot: { zone: { lotId } },
      status: { in: ["CONFIRMED", "ACTIVE"] },
      startTime: { lt: horizon },
      endTime: { gt: new Date(nowMs - 1000) },
    },
    select: { startTime: true, endTime: true },
  });

  // Historical baseline: average reservations per hour-of-day that started
  // in the last LOOKBACK_DAYS window, to infer normal demand.
  const historyStart = new Date(nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const historical = await prisma.reservation.findMany({
    where: {
      spot: { zone: { lotId } },
      status: { notIn: ["CANCELLED", "EXPIRED"] },
      startTime: { gte: historyStart },
    },
    select: { startTime: true },
  });

  const buckets = new Array<number>(24).fill(0);
  const bucketCounts = new Array<number>(24).fill(0);
  for (const r of historical) {
    const hour = r.startTime.getHours();
    buckets[hour]++;
    bucketCounts[hour]++;
  }

  const bucketMean = (hour: number) =>
    bucketCounts[hour] > 0
      ? buckets[hour] / Math.max(1, LOOKBACK_DAYS)
      : 0;

  // Scale the historical average by how the lot is doing RIGHT NOW so the
  // forecast reflects live conditions rather than stale averages.
  const currentHourMean = bucketMean(now.getHours());
  const demandFactor =
    currentHourMean > 0 ? nowOccupied / currentHourMean : 0.4;

  const hours: HourForecast[] = [];
  for (let i = 0; i < HOURS; i++) {
    const bucketStart = new Date(nowMs);
    bucketStart.setMinutes(0, 0, 0);
    bucketStart.setHours(bucketStart.getHours() + i);
    const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);

    const reservedThisHour = scheduled.filter(
      (r) => r.startTime < bucketEnd && r.endTime > bucketStart
    ).length;

    const predictedNew = demandFactor * bucketMean(bucketStart.getHours());

    const predictedOccupied = nowOccupied + reservedThisHour + predictedNew;
    const predictedAvailable = clamp(
      lot.totalSpots - Math.round(predictedOccupied),
      0,
      lot.totalSpots
    );

    const liveShare = nowOccupied + reservedThisHour;
    const confidence: HourForecast["confidence"] =
      bucketCounts[bucketStart.getHours()] >= 3
        ? liveShare / lot.totalSpots >= 0.35
          ? "high"
          : "medium"
        : "low";

    hours.push({
      hour: bucketStart.toISOString(),
      label: bucketStart.toLocaleTimeString("en-US", {
        hour: "numeric",
        hour12: true,
      }),
      predictedAvailable,
      predictedOccupancyPct: Math.round(
        (clamp(predictedOccupied, 0, lot.totalSpots) / lot.totalSpots) * 100
      ),
      confidence,
    });
  }

  return NextResponse.json({
    lotId,
    totalSpots: lot.totalSpots,
    availableNow: lot.totalSpots - nowOccupied,
    horizon: HOURS,
    hours,
  });
}