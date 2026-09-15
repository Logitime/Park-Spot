import { prisma } from "@/lib/prisma";
import { sendEmail, emailSubject } from "@/lib/email";

export interface NotifyArgs {
  userId: string;
  type: string;
  content: string;
  relatedId?: string | null;
}

export async function notifyUser({
  userId,
  type,
  content,
  relatedId = null,
}: NotifyArgs) {
  const notification = await prisma.notification.create({
    data: { userId, type, content, relatedId },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (user) {
    const sent = await sendEmail({
      to: user.email,
      subject: emailSubject(type),
      text: content,
    });
    if (sent) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailSent: true },
      });
    }
  }

  return notification;
}

const REMINDER_WINDOW_MS = 60 * 60 * 1000;

export async function ensureUpcomingReminders(userId: string) {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);

  const upcoming = await prisma.reservation.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      startTime: { gte: now, lte: horizon },
    },
    include: {
      spot: {
        include: {
          zone: { include: { lot: { select: { name: true } } } },
        },
      },
    },
  });

  for (const res of upcoming) {
    const existing = await prisma.notification.findFirst({
      where: { userId, type: "RESERVATION_REMINDER", relatedId: res.id },
    });
    if (existing) continue;

    const minutes = Math.max(
      0,
      Math.round((res.startTime.getTime() - Date.now()) / 60_000)
    );
    const content = `Your parking at ${res.spot.zone.lot.name} (spot #${res.spot.number}) starts in ${minutes} min. Your QR gate pass is ready in My bookings.`;
    await notifyUser({
      userId,
      type: "RESERVATION_REMINDER",
      content,
      relatedId: res.id,
    });
  }
}