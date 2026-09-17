import { NextResponse } from "next/server";
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

  const [setting, tokenSetting] = await Promise.all([
    prisma.appSetting.findUnique({
      where: { key: CAM_URL_KEY },
    }),
    prisma.appSetting.findUnique({
      where: { key: CAM_TOKEN_KEY },
    }),
  ]);
  const camUrl = setting?.value?.trim() ?? "";
  const camToken = tokenSetting?.value?.trim() ?? "";

  if (!camUrl) {
    return NextResponse.json({
      up: false,
      camUrlSet: false,
      detail: "LPR camera server URL not configured.",
      lanes: [],
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const qs = camToken ? `?t=${encodeURIComponent(camToken)}` : "";
    const res = await fetch(`${camUrl}/status${qs}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return NextResponse.json({
        up: false,
        camUrlSet: true,
        detail: `LPR status → HTTP ${res.status}`,
        lanes: [],
      });
    }
    const data = (await res.json()) as { lanes?: LaneRemote[] };
    return NextResponse.json({
      up: true,
      camUrlSet: true,
      lanes: (data.lanes ?? []).map((l) => ({
        id: l.id,
        name: l.name ?? l.id,
        direction: l.direction ?? "ENTRY",
        fps: l.fps ?? 15,
        camera: Boolean(l.camera),
        source: "lpr",
      })),
    });
  } catch {
    const gates = await prisma.gate.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        direction: true,
        cameraType: true,
        rtspUrl: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      up: false,
      camUrlSet: true,
      detail: "LPR camera server is not reachable. Showing configured gates.",
      lanes: gates.map((g) => ({
        id: g.id,
        name: g.name,
        direction: g.direction,
        camera: g.cameraType === "usb" || Boolean(g.rtspUrl),
        source: "gate-config",
      })),
    });
  }
}

type LaneRemote = {
  id: string;
  name?: string;
  direction?: string;
  fps?: number;
  camera?: boolean;
};