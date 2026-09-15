import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";

const schema = z.object({
  reservationId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured on this server." },
      { status: 503 }
    );
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
    include: {
      spot: { include: { zone: { include: { lot: { select: { name: true } } } } } },
    },
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

  const origin = new URL(request.url).origin;
  const checkout = await createCheckoutSession({
    reservationId: reservation.id,
    amount: reservation.totalPrice,
    description: `Parking at ${reservation.spot.zone.lot.name} — spot #${reservation.spot.number}`,
    successUrl: `${origin}/reservations?paid=1`,
    cancelUrl: `${origin}/reservations`,
  });

  if (!checkout) {
    return NextResponse.json(
      { error: "Could not create a checkout session." },
      { status: 502 }
    );
  }

  return NextResponse.json({ sessionUrl: checkout.url });
}