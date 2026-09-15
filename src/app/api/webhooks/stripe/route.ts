import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import { notifyUser } from "@/lib/notify";

export const runtime = "nodejs";

async function handleSessionCompleted(session: Stripe.Checkout.Session) {
  const reservationId = session.metadata?.reservationId;
  if (!reservationId) {
    console.warn("[stripe:webhook] session without reservationId metadata");
    return;
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      payments: true,
      spot: { include: { zone: true } },
    },
  });

  if (!reservation) {
    console.warn(`[stripe:webhook] reservation ${reservationId} not found`);
    return;
  }

  if (reservation.status !== "PENDING") return;

  const charged = session.amount_total ? session.amount_total / 100 : reservation.totalPrice;

  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { reservationId: reservation.id, status: "PENDING" },
      data: {
        status: "PAID",
        provider: "STRIPE",
        providerRef:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? session.id,
        amount: charged,
      },
    });

    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: "CONFIRMED" },
    });
  });

  await notifyUser({
    userId: reservation.userId,
    type: "RESERVATION_CONFIRMED",
    content: `Payment received. Your parking reservation is confirmed for spot ${reservation.spot.zone.name} #${reservation.spot.number}.`,
    relatedId: reservation.id,
  });
}

export async function POST(request: NextRequest) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error("[stripe:webhook] signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      // Acknowledge unhandled events so Stripe stops retrying them.
      break;
  }

  return NextResponse.json({ received: true });
}