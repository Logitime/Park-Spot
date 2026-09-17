import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

const assignmentSchema = z.object({
  userId: z.string().min(1),
  gateId: z.string().min(1),
});

const bodySchema = z.object({
  assignments: z.array(assignmentSchema).max(500),
});

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/shifts/[id]/assignments">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const shift = await prisma.shift.findUnique({ where: { id } });
  if (!shift) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  // Deduplicate (userId, gateId) pairs.
  const seen = new Set<string>();
  const pairs: { userId: string; gateId: string }[] = [];
  for (const a of parsed.data.assignments) {
    const key = `${a.userId}|${a.gateId}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(a);
    }
  }

  const userIds = [...new Set(pairs.map((p) => p.userId))];
  const gateIds = [...new Set(pairs.map((p) => p.gateId))];

  const [users, gates] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, role: { in: ["OPERATOR", "ADMIN"] } },
      select: { id: true },
    }),
    prisma.gate.findMany({ where: { id: { in: gateIds } }, select: { id: true } }),
  ]);

  const validUsers = new Set(users.map((u) => u.id));
  const validGates = new Set(gates.map((g) => g.id));

  const unknownUser = pairs.find((p) => !validUsers.has(p.userId));
  if (unknownUser) {
    return NextResponse.json(
      { error: "One or more assigned users do not exist or are not OPERATOR/ADMIN" },
      { status: 400 }
    );
  }
  const unknownGate = pairs.find((p) => !validGates.has(p.gateId));
  if (unknownGate) {
    return NextResponse.json(
      { error: "One or more assigned gates do not exist" },
      { status: 400 }
    );
  }

  // Full replace of this shift's roster inside one transaction.
  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { shiftId: id } }),
    prisma.shiftAssignment.createMany({
      data: pairs.map((p) => ({ userId: p.userId, gateId: p.gateId, shiftId: id })),
    }),
  ]);

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "SHIFT_ASSIGNMENTS_UPDATED",
    details: `shift=${shift.id} name="${shift.name}" assignments=${pairs.length}`,
  });

  const updated = await prisma.shift.findUnique({
    where: { id },
    include: {
      assignments: {
        select: {
          id: true,
          userId: true,
          gateId: true,
          user: { select: { id: true, name: true, email: true, role: true } },
          gate: { select: { id: true, name: true, direction: true } },
        },
      },
    },
  });

  return NextResponse.json({ shift: updated, count: pairs.length });
}