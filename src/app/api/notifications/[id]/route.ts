import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/notifications/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const body = await request.json().catch(() => ({}));
  const read = typeof body.read === "boolean" ? body.read : true;

  const existing = await prisma.notification.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  const notification = await prisma.notification.update({
    where: { id },
    data: { read },
  });

  return NextResponse.json({
    notification: {
      id: notification.id,
      read: notification.read,
    },
    unreadCount: await prisma.notification.count({
      where: { userId: session.userId, read: false },
    }),
  });
}