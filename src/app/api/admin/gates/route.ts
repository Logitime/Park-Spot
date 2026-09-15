import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

const gateSelect = {
  id: true,
  name: true,
  direction: true,
  enabled: true,
  cameraType: true,
  rtspUrl: true,
  usbDevice: true,
  roi: true,
  plcHost: true,
  plcPort: true,
  plcUnit: true,
  plcRegisters: true,
  openSeconds: true,
  lotId: true,
  zoneId: true,
  createdAt: true,
  lot: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true } },
  operators: { select: { id: true, name: true, email: true, role: true } },
} as const;

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const gates = await prisma.gate.findMany({
    select: gateSelect,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ gates });
}

export async function POST(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const name = (body.name ?? "").trim();
  const plcHost = (body.plcHost ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Gate name is required" }, { status: 400 });
  }
  if (!plcHost) {
    return NextResponse.json({ error: "PLC host is required" }, { status: 400 });
  }

  const direction = body.direction === "EXIT" ? "EXIT" : "ENTRY";

  // PLC registers: accept JSON string or object, store as JSON string
  let plcRegisters: string | null = null;
  if (body.plcRegisters) {
    const raw = typeof body.plcRegisters === "string" ? body.plcRegisters : JSON.stringify(body.plcRegisters);
    try {
      JSON.parse(raw); // validate
      plcRegisters = raw;
    } catch {
      return NextResponse.json({ error: "plcRegisters must be valid JSON" }, { status: 400 });
    }
  }

  // ROI: accept JSON string or array, store as JSON string
  let roi: string | null = null;
  if (body.roi) {
    const raw = typeof body.roi === "string" ? body.roi : JSON.stringify(body.roi);
    try {
      JSON.parse(raw);
      roi = raw;
    } catch {
      return NextResponse.json({ error: "roi must be valid JSON array" }, { status: 400 });
    }
  }

  const operatorIds: string[] = Array.isArray(body.operatorIds)
    ? body.operatorIds.filter((id: unknown) => typeof id === "string" && id.length > 0)
    : [];

  const gate = await prisma.gate.create({
    data: {
      name,
      direction,
      enabled: body.enabled !== false,
      cameraType: body.cameraType === "usb" ? "usb" : "rtsp",
      rtspUrl: (body.rtspUrl ?? "").trim() || null,
      usbDevice: Number(body.usbDevice ?? 0),
      roi,
      plcHost,
      plcPort: Number(body.plcPort ?? 502),
      plcUnit: Number(body.plcUnit ?? 1),
      plcRegisters,
      openSeconds: Number(body.openSeconds ?? 20),
      lotId: body.lotId || null,
      zoneId: body.zoneId || null,
      operators: operatorIds.length > 0
        ? { connect: operatorIds.map((id) => ({ id })) }
        : undefined,
    },
    select: gateSelect,
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "GATE_CREATED",
    details: `gate=${gate.id} name="${gate.name}" direction=${gate.direction} plc=${gate.plcHost}:${gate.plcPort}`,
  });

  return NextResponse.json({ gate }, { status: 201 });
}
