import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const schema = z.object({
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED"]),
});

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/spots/[id]">
) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const { id } = await ctx.params;

  const spot = await prisma.spot.update({
    where: { id },
    data: { status: parsed.data.status },
    include: {
      zone: { include: { lot: { select: { name: true, address: true } } } },
    },
  });

  return NextResponse.json({ spot });
}