import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(1).max(24).optional(),
  multiplier: z.number().min(0).max(10).optional(),
});

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/admin/pricing/[ruleId]">) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ruleId } = await ctx.params;

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

  const next = {
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.dayOfWeek !== undefined && { dayOfWeek: parsed.data.dayOfWeek }),
    ...(parsed.data.startHour !== undefined && { startHour: parsed.data.startHour }),
    ...(parsed.data.endHour !== undefined && { endHour: parsed.data.endHour }),
    ...(parsed.data.multiplier !== undefined && { multiplier: parsed.data.multiplier }),
  };

  if (
    next.startHour !== undefined &&
    next.endHour !== undefined &&
    next.endHour <= next.startHour
  ) {
    return NextResponse.json(
      { error: "End hour must be after start hour" },
      { status: 400 }
    );
  }

  const existing = await prisma.pricingRule.findUnique({ where: { id: ruleId } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  if (
    next.endHour !== undefined &&
    next.startHour === undefined &&
    next.endHour <= existing.startHour
  ) {
    return NextResponse.json(
      { error: "End hour must be after start hour" },
      { status: 400 }
    );
  }

  const rule = await prisma.pricingRule.update({
    where: { id: ruleId },
    data: next,
  });

  return NextResponse.json({ rule });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/pricing/[ruleId]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ruleId } = await ctx.params;

  const existing = await prisma.pricingRule.findUnique({ where: { id: ruleId } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await prisma.pricingRule.delete({ where: { id: ruleId } });

  return NextResponse.json({ ok: true });
}