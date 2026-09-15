import Stripe from "stripe";

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function toCents(amount: number): number {
  return Math.max(1, Math.round(amount * 100));
}

export interface CheckoutOptions {
  reservationId: string;
  amount: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(
  options: CheckoutOptions
): Promise<Stripe.Checkout.Session | null> {
  const stripe = stripeClient();
  if (!stripe) return null;

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: toCents(options.amount),
          product_data: { name: options.description },
        },
      },
    ],
    metadata: { reservationId: options.reservationId },
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
  });
}

export async function refundStripePayment(
  providerRef: string | null,
  amount: number
): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe || !providerRef) return null;

  const paymentIntentId = providerRef.startsWith("pi_")
    ? providerRef
    : null;

  try {
    if (paymentIntentId) {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: toCents(amount),
      });
      return refund.id;
    }
  } catch (error) {
    console.error("[stripe] refund failed:", error);
  }
  return null;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}