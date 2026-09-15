import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";

export async function PUT(
  _request: NextRequest,
  ctx: RouteContext<"/api/reservations/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation || reservation.userId !== session.userId) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (!["PENDING", "CONFIRMED", "ACTIVE"].includes(reservation.status)) {
    return NextResponse.json(
      { error: "This reservation cannot be cancelled" },
      { status: 400 }
    );
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.reservation.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { spot: true, payments: true },
    });

    await tx.spot.update({
      where: { id: updated.spotId },
      data: { status: "AVAILABLE" },
    });

    for (const payment of updated.payments) {
      if (payment.status === "PENDING") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "CANCELLED" },
        });
      }
    }

    return updated;
  });

  await notifyUser({
    userId: session.userId,
    type: "RESERVATION_CANCELLED",
    content: "Your parking reservation has been cancelled.",
    relatedId: id,
  });

  return NextResponse.json({ reservation: cancelled });
}