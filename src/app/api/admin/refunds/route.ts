import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";
import { refundInTx } from "@/lib/refund";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payments = await prisma.payment.findMany({
    where: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      reservation: {
        select: {
          id: true,
          status: true,
          qrCode: true,
          user: { select: { name: true, email: true } },
          vehicle: { select: { plateNumber: true } },
          spot: {
            select: {
              number: true,
              zone: { select: { name: true, lot: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      refundedAmount: p.refundedAmount,
      status: p.status,
      provider: p.provider,
      providerRef: p.providerRef,
      refundedAt: p.refundedAt,
      createdAt: p.createdAt,
      reservation: p.reservation,
    })),
  });
}

const refundSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional().default("admin refund"),
});

export async function POST(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { id: parsed.data.paymentId },
  });
  if (!payment || payment.status === "REFUNDED") {
    return NextResponse.json({ error: "Payment not found or already refunded" }, { status: 404 });
  }
  if (payment.status === "PENDING" || payment.status === "FAILED" || payment.status === "CANCELLED") {
    return NextResponse.json({ error: "Only paid payments can be refunded" }, { status: 400 });
  }

  const amount = Math.min(
    parsed.data.amount ?? payment.amount,
    Math.max(0, payment.amount - payment.refundedAmount)
  );
  if (amount <= 0) {
    return NextResponse.json({ error: "Nothing left to refund" }, { status: 400 });
  }

  const ok = await prisma.$transaction(
    (tx) =>
      refundInTx(tx, {
        payment: {
          id: payment.id,
          amount: payment.amount,
          refundedAmount: payment.refundedAmount,
          provider: payment.provider,
          providerRef: payment.providerRef,
        },
        amount,
        reason: parsed.data.reason,
      })
  );

  if (!ok) {
    return NextResponse.json(
      { error: "Refund failed at the payment provider. Check Stripe and try again." },
      { status: 502 }
    );
  }

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "ADMIN_REFUND",
    details: `payment=${payment.id} amount=${amount} reason=${parsed.data.reason}`,
  });

  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  return NextResponse.json({ payment: updated });
}