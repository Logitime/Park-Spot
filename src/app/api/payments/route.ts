import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";

const schema = z.object({
  reservationId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: parsed.data.reservationId },
    include: { payments: true, spot: { include: { zone: true } } },
  });

  if (!reservation || reservation.userId !== session.userId) {
    return NextResponse.json(
      { error: "Reservation not found" },
      { status: 404 }
    );
  }

  if (reservation.status !== "PENDING") {
    return NextResponse.json(
      { error: "This reservation is not awaiting payment" },
      { status: 400 }
    );
  }

  // Demo payment simulation. Swap this block with a real Stripe
  // Checkout Session / Payment Intent flow in production.
  const providerRef = `demo_${Math.random().toString(36).slice(2, 12)}`;

  const payment = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: reservation.payments[0].id },
      data: { status: "PAID", providerRef },
    });

    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: "CONFIRMED" },
    });

    return updated;
  });

  const content = `Payment received. Your parking reservation is confirmed for spot ${reservation.spot.zone.name} #${reservation.spot.number}.`;
  await notifyUser({
    userId: session.userId,
    type: "RESERVATION_CONFIRMED",
    content,
    relatedId: reservation.id,
  });

  return NextResponse.json({
    payment,
    reservation: { ...reservation, status: "CONFIRMED" },
    message: "Payment successful. Reservation confirmed.",
  });
}