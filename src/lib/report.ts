import { prisma } from "./prisma";
import { sendEmail } from "./email";

const GATE_KEY = "last_daily_report";

function dayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, dayLabel: start.toISOString().slice(0, 10) };
}

export async function maybeSendDailyReport(): Promise<{ sent: boolean; skipped: boolean }> {
  const gate = await prisma.appSetting.findUnique({ where: { key: GATE_KEY } });
  const { dayLabel } = dayRange();
  if (gate?.value === dayLabel) return { sent: false, skipped: true };

  await sendDailyReport();
  await prisma.appSetting.upsert({
    where: { key: GATE_KEY },
    create: { key: GATE_KEY, value: dayLabel },
    update: { value: dayLabel },
  });
  return { sent: true, skipped: false };
}

export async function sendDailyReport(): Promise<boolean> {
  const { start, end, dayLabel } = dayRange();

  const [payments, reservations, active, lots, managers] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: { gte: start, lt: end }, status: "PAID" },
      select: { amount: true },
    }),
    prisma.reservation.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { id: true, status: true },
    }),
    prisma.reservation.count({ where: { status: "ACTIVE" } }),
    prisma.parkingLot.findMany({
      include: {
        zones: {
          include: {
            spots: { select: { status: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "OPERATOR"] } },
      select: { email: true },
    }),
  ]);

  const revenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const newReservations = reservations.length;

  const lotCounts = lots.map((lot) => {
    const spots = lot.zones.flatMap((z) => z.spots);
    const occupied = spots.filter((s) => s.status === "OCCUPIED").length;
    return { name: lot.name, occupied, total: spots.length };
  });
  const topLot = lotCounts.sort((a, b) => b.occupied - a.occupied)[0];

  const lines = [
    `ParkSpot daily operations report — ${dayLabel}`,
    "",
    `New reservations:  ${newReservations}`,
    `Revenue (collected): $${revenue.toFixed(2)}`,
    `Currently on site:  ${active}`,
    `Most occupied lot:  ${topLot ? `${topLot.name} (${topLot.occupied}/${topLot.total} spots)` : "n/a"}`,
    "",
    "— ParkSpot ops bot",
  ].join("\n");

  const to = managers.map((m) => m.email).filter(Boolean);
  if (to.length === 0) {
    console.log("[report] no manager emails configured; report:\n" + lines);
    return true;
  }

  const results = await Promise.all(
    to.map((email) =>
      sendEmail({
        to: email,
        subject: `ParkSpot daily ops report ${dayLabel}`,
        text: lines,
      })
    )
  );

  return results.every(Boolean);
}