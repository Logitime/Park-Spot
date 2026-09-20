import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

let cachedPayload: any = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5000; // 5-second cache for fast navigation

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (cachedPayload && Date.now() - lastCacheTime < CACHE_TTL_MS) {
    return NextResponse.json(cachedPayload);
  }

  const lots = await prisma.parkingLot.findMany({ select: { id: true, name: true } });

  const lotStats = await Promise.all(
    lots.map(async (lot) => {
      const total = await prisma.spot.count({
        where: { zone: { lotId: lot.id } },
      });
      const available = await prisma.spot.count({
        where: { zone: { lotId: lot.id }, status: "AVAILABLE" },
      });
      const occupied = await prisma.spot.count({
        where: { zone: { lotId: lot.id }, status: "OCCUPIED" },
      });
      const reserved = await prisma.spot.count({
        where: { zone: { lotId: lot.id }, status: "RESERVED" },
      });

      const revenue = await prisma.payment.aggregate({
        where: {
          status: "PAID",
          reservation: { spot: { zone: { lotId: lot.id } } },
        },
        _sum: { amount: true },
      });

      const confirmedToday = await prisma.reservation.count({
        where: {
          spot: { zone: { lotId: lot.id } },
          status: "CONFIRMED",
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      });

      return {
        lotId: lot.id,
        name: lot.name,
        total,
        available,
        occupied,
        reserved,
        occupancyPct: total ? Math.round(((occupied + reserved) / total) * 100) : 0,
        revenue: revenue._sum.amount ?? 0,
        confirmedToday,
      };
    })
  );

  const users = await prisma.user.count();
  const totalRevenue = lotStats.reduce((sum, l) => sum + l.revenue, 0);
  const totalReservations = await prisma.reservation.count();
  const totalPayments = await prisma.payment.count({
    where: { status: "PAID" },
  });
  const recentReservations = await prisma.reservation.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      spot: { include: { zone: { include: { lot: { select: { name: true } } } } } },
    },
  });

  const days: { date: Date; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      date: d,
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
    });
  }

  const dailyTrend = await Promise.all(
    days.map(async ({ date, label }) => {
      const dayStart = date.getTime();
      const dayEnd = dayStart + 86_400_000;
      const [reservations, checkins, revenueAgg] = await Promise.all([
        prisma.reservation.count({
          where: { createdAt: { gte: new Date(dayStart), lt: new Date(dayEnd) } },
        }),
        prisma.reservation.count({
          where: {
            updatedAt: { gte: new Date(dayStart), lt: new Date(dayEnd) },
            status: "ACTIVE",
          },
        }),
        prisma.payment.aggregate({
          where: {
            status: "PAID",
            createdAt: { gte: new Date(dayStart), lt: new Date(dayEnd) },
          },
          _sum: { amount: true },
        }),
      ]);
      return {
        date: new Date(dayStart).toISOString(),
        label,
        reservations,
        checkins,
        revenue: revenueAgg._sum.amount ?? 0,
      };
    })
  );

  const payload = {
    summary: {
      totalUsers: users,
      totalReservations,
      totalPayments,
      totalRevenue,
    },
    lots: lotStats,
    dailyTrend,
    recentReservations: recentReservations.map((r) => ({
      id: r.id,
      user: r.user.name,
      email: r.user.email,
      lot: r.spot.zone.lot.name,
      spot: r.spot.number,
      status: r.status,
      amount: r.totalPrice,
      createdAt: r.createdAt,
    })),
  };

  cachedPayload = payload;
  lastCacheTime = Date.now();

  return NextResponse.json(payload);
}