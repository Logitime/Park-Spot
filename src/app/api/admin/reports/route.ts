import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") ?? "occupancy";

  let csv = "";
  let filename = "report.csv";

  if (kind === "occupancy") {
    const lots = await prisma.parkingLot.findMany({
      select: { id: true, name: true },
    });
    const rows: string[][] = [];
    for (const lot of lots) {
      const total = await prisma.spot.count({ where: { zone: { lotId: lot.id } } });
      const available = await prisma.spot.count({
        where: { zone: { lotId: lot.id }, status: "AVAILABLE" },
      });
      const occupied = await prisma.spot.count({
        where: { zone: { lotId: lot.id }, status: "OCCUPIED" },
      });
      const reserved = await prisma.spot.count({
        where: { zone: { lotId: lot.id }, status: "RESERVED" },
      });
      const occupancyPct = total ? Math.round(((occupied + reserved) / total) * 100) : 0;
      rows.push([
        lot.id,
        lot.name,
        String(total),
        String(available),
        String(occupied),
        String(reserved),
        `${occupancyPct}%`,
        new Date().toISOString(),
      ]);
    }
    csv =
      "Lot ID,Lot Name,Total Spots,Available,Occupied,Reserved,Occupancy %,Generated At\n" +
      rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    filename = "occupancy-report.csv";
  } else if (kind === "revenue") {
    const days = await prisma.payment.findMany({
      where: { status: "PAID" },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const byDay = new Map<string, { count: number; total: number }>();
    for (const p of days) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const cur = byDay.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += p.amount;
      byDay.set(key, cur);
    }
    const rows = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => [date, String(v.count), String(Number(v.total.toFixed(2)))]);
    csv =
      "Date,Paid Transactions,Revenue\n" +
      rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    filename = "revenue-report.csv";
  } else if (kind === "reservations") {
    const reservations = await prisma.reservation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        spot: { include: { zone: { include: { lot: { select: { name: true } } } } } },
        payments: { select: { status: true } },
      },
    });
    const rows = reservations.map((r) => [
      r.id,
      r.user.name,
      r.user.email,
      r.spot.zone.lot.name,
      String(r.spot.number),
      r.status,
      String(r.totalPrice),
      r.payments.some((p) => p.status === "PAID") ? "PAID" : "UNPAID",
      r.createdAt.toISOString(),
      r.startTime.toISOString(),
      r.endTime.toISOString(),
    ]);
    csv =
      "Reservation ID,User,Email,Lot,Spot,Status,Amount,Payment,Created,Start,End\n" +
      rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    filename = "reservations-report.csv";
  } else {
    return NextResponse.json({ error: "Unknown report kind" }, { status: 400 });
  }

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}