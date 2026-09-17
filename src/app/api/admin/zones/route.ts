import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lots = await prisma.parkingLot.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      zones: {
        select: {
          id: true,
          name: true,
          floor: true,
          priceMultiplier: true,
          _count: { select: { spots: true, gates: true } },
        },
        orderBy: { floor: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ lots });
}

const createSchema = z.object({
  lotId: z.string().min(1, "Lot is required"),
  name: z.string().min(1, "Zone name is required").max(80),
  floor: z.coerce.number().int().min(-10).max(200).default(0),
  priceMultiplier: z.coerce.number().min(0).max(10).default(1),
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

  const { lotId, name, floor, priceMultiplier } = parsed.data;

  const lot = await prisma.parkingLot.findUnique({ where: { id: lotId } });
  if (!lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  const zone = await prisma.zone.create({
    data: { lotId, name, floor, priceMultiplier },
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "ZONE_CREATED",
    details: `zone=${zone.id} name="${zone.name}" lot=${lotId} floor=${zone.floor}`,
  });

  return NextResponse.json({ zone }, { status: 201 });
}