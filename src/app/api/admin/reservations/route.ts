import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();

  const where = {
    ...(status && { status }),
    ...(q && {
      OR: [
        { qrCode: { contains: q } },
        { id: { contains: q } },
        { user: { name: { contains: q } } },
        { user: { email: { contains: q } } },
      ],
    }),
  };

  const reservations = await prisma.reservation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, name: true, email: true } },
      spot: { include: { zone: { include: { lot: { select: { id: true, name: true } } } } } },
      payments: { select: { status: true, amount: true } },
    },
  });

  return NextResponse.json({
    reservations: reservations.map((r) => ({
      id: r.id,
      qrCode: r.qrCode,
      status: r.status,
      startTime: r.startTime,
      endTime: r.endTime,
      totalPrice: r.totalPrice,
      createdAt: r.createdAt,
      user: r.user,
      spot: {
        number: r.spot.number,
        zone: r.spot.zone.name,
        lot: r.spot.zone.lot.name,
      },
      paid: r.payments.some((p) => p.status === "PAID"),
    })),
  });
}