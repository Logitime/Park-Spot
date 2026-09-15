import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

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

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/gates/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const gate = await prisma.gate.findUnique({
    where: { id },
    select: gateSelect,
  });

  if (!gate) {
    return NextResponse.json({ error: "Gate not found" }, { status: 404 });
  }

  return NextResponse.json({ gate });
}

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/gates/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.gate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Gate not found" }, { status: 404 });
  }

  const body = await request.json();

  const data: Record<string, unknown> = {};

  if ("name" in body) {
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Gate name is required" }, { status: 400 });
    }
    data.name = name;
  }
  if ("plcHost" in body) {
    const plcHost = (body.plcHost ?? "").trim();
    if (!plcHost) {
      return NextResponse.json({ error: "PLC host is required" }, { status: 400 });
    }
    data.plcHost = plcHost;
  }
  if ("direction" in body) {
    data.direction = body.direction === "EXIT" ? "EXIT" : "ENTRY";
  }
  if ("enabled" in body) {
    data.enabled = !!body.enabled;
  }
  if ("cameraType" in body) {
    data.cameraType = body.cameraType === "usb" ? "usb" : "rtsp";
  }
  if ("rtspUrl" in body) {
    data.rtspUrl = (body.rtspUrl ?? "").trim() || null;
  }
  if ("usbDevice" in body) {
    data.usbDevice = Number(body.usbDevice ?? 0);
  }
  if ("plcPort" in body) {
    data.plcPort = Number(body.plcPort ?? 502);
  }
  if ("plcUnit" in body) {
    data.plcUnit = Number(body.plcUnit ?? 1);
  }
  if ("openSeconds" in body) {
    data.openSeconds = Number(body.openSeconds ?? 20);
  }
  if ("lotId" in body) {
    data.lotId = body.lotId || null;
  }
  if ("zoneId" in body) {
    data.zoneId = body.zoneId || null;
  }
  if ("plcRegisters" in body) {
    if (body.plcRegisters) {
      const raw = typeof body.plcRegisters === "string" ? body.plcRegisters : JSON.stringify(body.plcRegisters);
      try {
        JSON.parse(raw);
        data.plcRegisters = raw;
      } catch {
        return NextResponse.json({ error: "plcRegisters must be valid JSON" }, { status: 400 });
      }
    } else {
      data.plcRegisters = null;
    }
  }
  if ("roi" in body) {
    if (body.roi) {
      const raw = typeof body.roi === "string" ? body.roi : JSON.stringify(body.roi);
      try {
        JSON.parse(raw);
        data.roi = raw;
      } catch {
        return NextResponse.json({ error: "roi must be valid JSON array" }, { status: 400 });
      }
    } else {
      data.roi = null;
    }
  }

  // Operator sync (full replace)
  if ("operatorIds" in body && Array.isArray(body.operatorIds)) {
    data.operators = {
      set: body.operatorIds
        .filter((oid: unknown) => typeof oid === "string" && oid.length > 0)
        .map((oid: string) => ({ id: oid })),
    };
  }

  const gate = await prisma.gate.update({
    where: { id },
    data,
    select: gateSelect,
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "GATE_UPDATED",
    details: `gate=${gate.id} name="${gate.name}"`,
  });

  return NextResponse.json({ gate });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/gates/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.gate.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Gate not found" }, { status: 404 });
  }

  await prisma.gate.delete({ where: { id } });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "GATE_DELETED",
    details: `gate=${id} name="${existing.name}"`,
  });

  return NextResponse.json({ ok: true });
}
