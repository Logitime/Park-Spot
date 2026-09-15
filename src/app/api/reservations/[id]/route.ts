import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";
import { getPolicy, logAudit } from "@/lib/settings";
import { computeRefundAmount, refundInTx } from "@/lib/refund";

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

  const policy = await getPolicy();
  const now = new Date();
  const startMs = reservation.startTime.getTime();
  const freeCancelMs = policy.freeCancelMinutes * 60_000;

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
        continue;
      }
      if (payment.status !== "PAID") continue;

      if (now.getTime() <= startMs + freeCancelMs) {
        await refundInTx(tx, {
          payment: { ...payment, refundedAmount: 0 },
          amount: payment.amount,
          reason: "cancellation in free window",
        });
      } else if (policy.partialRefundEnabled) {
        const refund = computeRefundAmount(
          payment.amount,
          reservation.startTime,
          reservation.endTime,
          now
        );
        if (refund > 0) {
          await refundInTx(tx, {
            payment: { ...payment, refundedAmount: 0 },
            amount: refund,
            reason: "prorated early-exit refund",
          });
        }
      }
    }

    return updated;
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "RESERVATION_CANCELLED",
    details: `reservation=${id} totalPrice=${reservation.totalPrice}`,
  });

  await notifyUser({
    userId: session.userId,
    type: "RESERVATION_CANCELLED",
    content: "Your parking reservation has been cancelled. Any refund will be processed.",
    relatedId: id,
  });

  return NextResponse.json({ reservation: cancelled });
}