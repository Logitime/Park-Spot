import { prisma } from "./prisma";
import { refundStripePayment } from "./stripe";
import type { Prisma } from "../generated/prisma/client";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Prorated refund amount based on unused time.
 * - Before start: full amount (nothing consumed).
 * - After end: zero (session fully consumed).
 */
export function computeRefundAmount(
  paid: number,
  start: Date,
  end: Date,
  now = new Date(),
): number {
  if (paid <= 0) return 0;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nowMs = now.getTime();
  if (nowMs <= startMs) return round2(paid);
  if (nowMs >= endMs) return 0;
  const total = endMs - startMs;
  const remaining = endMs - Math.max(nowMs, startMs);
  const refund = paid * (remaining / total);
  return Math.min(paid, round2(refund));
}

export interface RefundInput {
  payment: {
    id: string;
    amount: number; // original charged amount
    refundedAmount: number; // amount already refunded before this one
    provider: string;
    providerRef: string | null;
  };
  amount: number; // new refund chunk
  reason: string;
}

/**
 * Marks a payment as refunded (partial refunds tracked via refundedAmount).
 * Real Stripe payments are refunded through the API; demo payments are
 * immediately marked locally.
 */
export async function refundInTx(
  tx: Prisma.TransactionClient,
  input: RefundInput,
): Promise<boolean> {
  const { payment, amount, reason } = input;
  if (amount <= 0) return true;

  const chunk = Math.min(round2(amount), Math.max(0, payment.amount - payment.refundedAmount));
  if (chunk <= 0) return true;

  const cumulative = round2(payment.refundedAmount + chunk);
  const fullyRefunded = cumulative >= payment.amount;

  const realStripeRef = payment.providerRef && !payment.providerRef.startsWith("demo_");
  if (payment.provider === "STRIPE" && realStripeRef) {
    const ref = await refundStripePayment(payment.providerRef, chunk);
    if (!ref) {
      await logRefundAudit(payment.id, chunk, reason, false, "stripe_refund_failed");
      return false;
    }
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      refundedAmount: cumulative,
      refundedAt: new Date(),
    },
  });

  await logRefundAudit(payment.id, chunk, reason, true, null);
  return true;
}

async function logRefundAudit(
  paymentId: string,
  amount: number,
  reason: string,
  ok: boolean,
  note: string | null,
) {
  if (!ok) {
    await prisma.auditLog.create({
      data: {
        userId: null,
        userRole: "SYSTEM",
        action: "REFUND_FAILED",
        details: `payment=${paymentId} amount=${amount} reason=${reason} note=${note ?? "unknown"}`,
      },
    });
    return;
  }
  await prisma.auditLog.create({
    data: {
      userId: null,
      userRole: "SYSTEM",
      action: "REFUND",
      details: `payment=${paymentId} amount=${amount} reason=${reason}`,
    },
  });
}