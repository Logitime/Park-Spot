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

  const plate = request.nextUrl.searchParams.get("plate")?.trim().toUpperCase();
  if (!plate || plate.length < 2) {
    return NextResponse.json({ error: "Enter a license plate" }, { status: 400 });
  }

  const matches = await prisma.vehicle.findMany({
    where: { plateNumber: { contains: plate } },
    select: {
      id: true,
      plateNumber: true,
      type: true,
      reservations: {
        where: {
          status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
          endTime: { gte: new Date() },
        },
        orderBy: { startTime: "asc" },
        take: 5,
        include: {
          user: { select: { id: true, name: true, email: true } },
          spot: {
            include: {
              zone: { include: { lot: { select: { id: true, name: true } } } },
            },
          },
          payments: { select: { status: true, amount: true } },
        },
      },
    },
  });

  const vehicles = matches
    .filter((v) => v.reservations.length > 0)
    .map((v) => ({
      plateNumber: v.plateNumber,
      type: v.type,
      reservations: v.reservations.map((r) => ({
        id: r.id,
        qrCode: r.qrCode,
        status: r.status,
        startTime: r.startTime,
        endTime: r.endTime,
        totalPrice: r.totalPrice,
        user: r.user,
        spot: {
          number: r.spot.number,
          zone: r.spot.zone.name,
          lot: r.spot.zone.lot.name,
        },
        paid: r.payments.some((p) => p.status === "PAID"),
      })),
    }));

  return NextResponse.json({ plate, vehicles });
}