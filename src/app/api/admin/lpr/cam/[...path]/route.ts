import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const CAM_URL_KEY = "lpr.camUrl";
const CAM_TOKEN_KEY = "lpr.camToken";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/lpr/cam/[...path]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await ctx.params;
  if (path.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [camUrlSetting, camTokenSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: CAM_URL_KEY } }),
    prisma.appSetting.findUnique({ where: { key: CAM_TOKEN_KEY } }),
  ]);
  const camUrl = camUrlSetting?.value?.trim().replace(/\/+$/, "") ?? "";
  if (!camUrl) {
    return NextResponse.json({ error: "LPR camera server URL not configured" }, { status: 404 });
  }

  let url = `${camUrl}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  if (camTokenSetting?.value) {
    const token = camTokenSetting.value.trim();
    if (token) {
      url += `${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}`;
    }
  }

  const isStream = path[0] === "stream";
  try {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!isStream) {
      timer = setTimeout(() => controller.abort(), 8000);
    }
    const res = await fetch(url, { signal: controller.signal });
    if (timer) clearTimeout(timer);
    if (!res.ok) {
      return NextResponse.json(
        { error: `LPR camera server → HTTP ${res.status}` },
        { status: 502 }
      );
    }
    if (!res.body) {
      return NextResponse.json({ error: "Empty camera response" }, { status: 502 });
    }
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "LPR camera server unreachable" },
      { status: 502 }
    );
  }
}