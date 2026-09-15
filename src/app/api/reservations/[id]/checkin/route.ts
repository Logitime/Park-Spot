import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";

const EARLY_GRACE_MS = 60 * 60 * 1000; // allow entry up to 1h before start

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/reservations/[id]/checkin">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { spot: { include: { zone: true } }, payments: true },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const isManager = session.role === "ADMIN" || session.role === "OPERATOR";
  if (!isManager && reservation.userId !== session.userId) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (reservation.status !== "CONFIRMED") {
    return NextResponse.json(
      {
        error:
          reservation.status === "ACTIVE"
            ? "Already checked in"
            : `Reservation is ${reservation.status}; only confirmed reservations can check in`,
      },
      { status: 400 }
    );
  }

  const unsettled = reservation.payments.some((p) => p.status !== "PAID");
  if (unsettled) {
    return NextResponse.json(
      { error: "Reservation must be paid before check-in" },
      { status: 400 }
    );
  }

  const start = new Date(reservation.startTime).getTime();
  if (Date.now() < start - EARLY_GRACE_MS) {
    return NextResponse.json(
      {
        error:
          "Check-in opens 1 hour before your reserved start time. Please come back later or contact the lot on arrival.",
      },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
    await tx.spot.update({
      where: { id: reservation.spotId },
      data: { status: "OCCUPIED" },
    });
  });

  await notifyUser({
    userId: reservation.userId,
    type: "RESERVATION_STARTED",
    content: `Checked in at ${reservation.spot.zone.name} #${reservation.spot.number} (${new Date().toLocaleString()}).`,
    relatedId: id,
  });

  return NextResponse.json({ ok: true });
}