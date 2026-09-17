import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAM_URL_KEY = "lpr.camUrl";
const CAM_TOKEN_KEY = "lpr.camToken";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [CAM_URL_KEY, CAM_TOKEN_KEY] } },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));

  return NextResponse.json({
    camUrl: map.get(CAM_URL_KEY) ?? "",
    camTokenSet: Boolean(map.get(CAM_TOKEN_KEY)),
  });
}

const updateSchema = z.object({
  camUrl: z.string().max(500).optional(),
  camToken: z.string().max(200).optional(),
});

export async function PUT(request: Request) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { camUrl, camToken } = parsed.data;
  const upserts = [];
  if (camUrl !== undefined) {
    upserts.push(
      prisma.appSetting.upsert({
        where: { key: CAM_URL_KEY },
        create: { key: CAM_URL_KEY, value: camUrl },
        update: { value: camUrl },
      })
    );
  }
  if (camToken !== undefined) {
    upserts.push(
      prisma.appSetting.upsert({
        where: { key: CAM_TOKEN_KEY },
        create: { key: CAM_TOKEN_KEY, value: camToken },
        update: { value: camToken },
      })
    );
  }
  await Promise.all(upserts);

  return NextResponse.json({ ok: true });
}