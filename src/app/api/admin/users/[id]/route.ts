import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
  email: z.string().email("Invalid email address").optional(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128)
    .optional(),
  role: z.enum(["USER", "OPERATOR", "ADMIN"]).optional(),
  enabled: z.boolean().optional(),
  gateIds: z.array(z.string()).optional(),
});

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/users/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { name, email, password, role, enabled, gateIds } = parsed.data;

  if (id === session.userId && enabled === false) {
    return NextResponse.json(
      { error: "You cannot disable your own account" },
      { status: 400 }
    );
  }

  if (email && email !== existing.email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (role !== undefined) data.role = role;
  if (enabled !== undefined) data.enabled = enabled;
  if (password) data.password = await hashPassword(password);
  if (gateIds !== undefined) {
    data.operatedGates = {
      set: gateIds.map((gid) => ({ id: gid })),
    };
  }

  const user = await prisma.user.update({ where: { id }, data });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "USER_UPDATED",
    details: `user=${user.id} name="${user.name}" role=${user.role} enabled=${user.enabled}`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/users/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (id === session.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.delete({ where: { id } });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "USER_DELETED",
    details: `user=${id} name="${existing.name}"`,
  });

  return NextResponse.json({ ok: true });
}