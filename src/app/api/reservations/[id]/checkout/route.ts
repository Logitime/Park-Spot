import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/reservations/[id]/checkout">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { spot: { include: { zone: true } } },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const isManager = session.role === "ADMIN" || session.role === "OPERATOR";
  if (!isManager && reservation.userId !== session.userId) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (reservation.status !== "ACTIVE") {
    return NextResponse.json(
      {
        error:
          reservation.status === "COMPLETED"
            ? "Already checked out"
            : `Reservation is ${reservation.status}; only active reservations can check out`,
      },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
    await tx.spot.update({
      where: { id: reservation.spotId },
      data: { status: "AVAILABLE" },
    });
  });

  await notifyUser({
    userId: reservation.userId,
    type: "RESERVATION_COMPLETED",
    content: `Checked out of ${reservation.spot.zone.name} #${reservation.spot.number}. Thanks for parking with us!`,
    relatedId: id,
  });

  return NextResponse.json({ ok: true });
}