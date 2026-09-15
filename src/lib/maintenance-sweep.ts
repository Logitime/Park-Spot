import { getPolicy } from "./settings";
import { prisma } from "./prisma";
import { notifyUser } from "./notify";
import { refundInTx } from "./refund";

let lastRunAt = 0;
const SWEEP_COOLDOWN_MS = 60_000;

async function cancelAndNotify(
  reservation: {
    id: string;
    userId: string;
    spotId: string;
    status: string;
    spot: { id: string };
    payments: { id: string; amount: number; status: string; provider: string; providerRef: string | null; refundedAmount: number }[];
  },
  reason: "UNPAID_EXPIRED" | "NO_SHOW" | "AUTO_CANCELLED",
) {
  const reasonLabel =
    reason === "UNPAID_EXPIRED"
      ? "expired (unpaid)"
      : reason === "NO_SHOW"
        ? "expired (no-show)"
        : "automatically cancelled";

  await prisma.$transaction(async (tx) => {
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: "EXPIRED" },
    });

    await tx.spot.update({
      where: { id: reservation.spotId },
      data: { status: "AVAILABLE" },
    });

    for (const payment of reservation.payments) {
      if (payment.status === "PENDING") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "CANCELLED" },
        });
      } else if (payment.status === "PAID" && reason === "NO_SHOW") {
        await refundInTx(tx, {
          payment,
          amount: payment.amount,
          reason: "no-show release",
        });
      }
    }
  });

  await notifyUser({
    userId: reservation.userId,
    type: "RESERVATION_CANCELLED",
    content: `Your reservation has been ${reasonLabel}.`,
    relatedId: reservation.id,
  });
}

export async function runMaintenanceSweep() {
  const now = Date.now();

  if (now - lastRunAt < SWEEP_COOLDOWN_MS) return { skipped: true };
  lastRunAt = now;

  const policy = await getPolicy();

  const pendingCutoff = new Date(
    now - policy.pendingCancelMinutes * 60_000,
  );
  const noShowCutoff = new Date(
    now - policy.noShowGraceMinutes * 60_000,
  );
  const autoCompleteCutoff = new Date(
    now - policy.autoCompleteMinutes * 60_000,
  );

  const stalePending = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: pendingCutoff },
    },
    include: { spot: true, payments: true },
  });

  const noShows = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      startTime: { lt: noShowCutoff },
    },
    include: { spot: true, payments: true },
  });

  const expiredActive = await prisma.reservation.findMany({
    where: {
      status: "ACTIVE",
      endTime: { lt: autoCompleteCutoff },
    },
    include: { spot: true, payments: true },
  });

  let expiredPending = 0;
  let expiredNoShow = 0;
  let completed = 0;

  for (const r of stalePending) {
    await cancelAndNotify({ ...r, status: r.status }, "UNPAID_EXPIRED");
    expiredPending++;
  }

  for (const r of noShows) {
    await cancelAndNotify({ ...r, status: r.status }, "NO_SHOW");
    expiredNoShow++;
  }

  for (const r of expiredActive) {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: r.id },
        data: { status: "COMPLETED" },
      });
      await tx.spot.update({
        where: { id: r.spotId },
        data: { status: "AVAILABLE" },
      });
    });

    await notifyUser({
      userId: r.userId,
      type: "RESERVATION_COMPLETED",
      content: "Your parking session has ended. Thank you!",
      relatedId: r.id,
    });
    completed++;
  }

  return {
    skipped: false,
    expiredPending,
    expiredNoShow,
    completed,
    timestamp: new Date(now).toISOString(),
  };
}

export async function maybeRunSweep() {
  try {
    return await runMaintenanceSweep();
  } catch (error) {
    console.error("[maintenance-sweep] opportunistic sweep failed:", error);
    return { skipped: true, error: String(error) };
  }
}
