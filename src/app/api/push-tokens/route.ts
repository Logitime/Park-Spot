import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const putSchema = z.object({
  token: z.string().min(1),
  platform: z.string().max(20).optional(),
});

const deleteSchema = z.object({
  token: z.string().min(1).optional(),
});

export async function PUT(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  await prisma.pushToken.upsert({
    where: { token: parsed.data.token },
    update: { userId: session.userId, platform: parsed.data.platform ?? "unknown" },
    create: {
      token: parsed.data.token,
      userId: session.userId,
      platform: parsed.data.platform ?? "unknown",
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  await prisma.pushToken.deleteMany({
    where: {
      userId: session.userId,
      ...(parsed.data.token ? { token: parsed.data.token } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}