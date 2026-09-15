import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";
import { readGateInputs, writeSingleCoil } from "@/lib/modbus";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/gates/[id]/plc
 * Body: { action: "read" | "open" | "close" }
 *
 * - read:   returns discrete+coil states (loop1, loop2, gateOpenSensor, open coil).
 * - open:   sets the open coil (Q1) HIGH.
 * - close:  sets the open coil (Q1) LOW.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/gates/[id]/plc">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const gate = await prisma.gate.findUnique({ where: { id } });
  if (!gate) {
    return NextResponse.json({ error: "Gate not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({ action: "read" }));
  const action = body.action === "open" || body.action === "close" ? body.action : "read";

  const registers: Record<string, { kind: string; address: number }> = gate.plcRegisters
    ? JSON.parse(gate.plcRegisters)
    : {
        loop1: { kind: "discrete", address: 0 },
        loop2: { kind: "discrete", address: 1 },
        gateOpenSensor: { kind: "discrete", address: 2 },
        open: { kind: "coil", address: 0 },
      };

  try {
    if (action === "read") {
      const inputs = await readGateInputs(
        gate.plcHost,
        gate.plcPort,
        gate.plcUnit,
        registers,
        3000,
      );
      return NextResponse.json({ ok: true, inputs, action: "read" });
    }

    // open / close
    const openReg = registers.open;
    if (!openReg || openReg.kind !== "coil") {
      return NextResponse.json({ error: "No open coil configured for this gate" }, { status: 400 });
    }

    const target = action === "open";
    await writeSingleCoil(
      gate.plcHost,
      gate.plcPort,
      gate.plcUnit,
      openReg.address,
      target,
      3000,
    );

    // read back
    const inputs = await readGateInputs(
      gate.plcHost,
      gate.plcPort,
      gate.plcUnit,
      registers,
      3000,
    );

    await logAudit({
      userId: session.userId,
      userRole: session.role,
      action: target ? "GATE_MANUAL_OPEN" : "GATE_MANUAL_CLOSE",
      details: `gate=${gate.id} name="${gate.name}"`,
    });

    return NextResponse.json({ ok: true, inputs, action });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
