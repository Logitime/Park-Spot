import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { ensureUpcomingReminders } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Lazily create + email "starts soon" reminders, then read.
  await ensureUpcomingReminders(session.userId);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { userId: session.userId, read: false },
    }),
  ]);

  return NextResponse.json({
    notifications: items.map((n) => ({
      id: n.id,
      type: n.type,
      content: n.content,
      relatedId: n.relatedId,
      read: n.read,
      createdAt: n.createdAt,
    })),
    unreadCount,
  });
}