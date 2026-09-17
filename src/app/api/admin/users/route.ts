import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  enabled: true,
  operatedGates: { select: { id: true, name: true, direction: true } },
  assignments: {
    select: {
      id: true,
      gateId: true,
      shiftId: true,
      shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      gate: { select: { id: true, name: true } },
    },
  },
} as const;

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { role: { in: ["OPERATOR", "ADMIN"] } },
    select: userSelect,
    orderBy: { name: "asc" },
  });

  // Compact shape for the settings UI.
  const compact = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    enabled: u.enabled,
    gateIds: u.operatedGates.map((g) => g.id),
    gates: u.operatedGates.map((g) => ({ id: g.id, name: g.name, direction: g.direction })),
    shifts: u.assignments.map((a) => ({
      id: a.id,
      shiftId: a.shiftId,
      shiftName: a.shift.name,
      startTime: a.shift.startTime,
      endTime: a.shift.endTime,
      gateId: a.gateId,
      gateName: a.gate.name,
    })),
  }));

  return NextResponse.json({ users: compact });
}

const createSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  role: z.enum(["OPERATOR", "ADMIN"]),
  enabled: z.boolean().optional(),
  gateIds: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { name, email, password, role, enabled, gateIds } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      enabled: enabled !== false,
      operatedGates:
        gateIds && gateIds.length > 0
          ? { connect: gateIds.map((id) => ({ id })) }
          : undefined,
    },
    select: userSelect,
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "USER_CREATED",
    details: `user=${user.id} name="${user.name}" email=${user.email} role=${user.role}`,
  });

  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        enabled: user.enabled,
      },
    },
    { status: 201 }
  );
}