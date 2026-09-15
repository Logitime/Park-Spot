import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";
import { generateQrCode, hoursBetween } from "@/lib/utils";
import { calculateDynamicPrice } from "@/lib/pricing";

const createSchema = z.object({
  spotId: z.string().min(1),
  vehicleId: z.string().optional().nullable(),
  plateNumber: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || v.length >= 2, "Plate number is too short"),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
});

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reservations = await prisma.reservation.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      spot: {
        include: {
          zone: {
            include: {
              lot: { select: { id: true, name: true, address: true } },
            },
          },
        },
      },
      vehicle: { select: { plateNumber: true, type: true } },
      payments: { select: { status: true, amount: true, provider: true } },
    },
  });

  return NextResponse.json({ reservations });
}

export async function POST(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { spotId, vehicleId, plateNumber, startTime, endTime } = parsed.data;
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (end <= start) {
    return NextResponse.json(
      { error: "End time must be after start time" },
      { status: 400 }
    );
  }
  if (start.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { error: "Start time must be in the future" },
      { status: 400 }
    );
  }
  const hours = hoursBetween(start, end);
  if (hours > 24) {
    return NextResponse.json(
      { error: "Reservations cannot exceed 24 hours" },
      { status: 400 }
    );
  }

  const spot = await prisma.spot.findUnique({
    where: { id: spotId },
    include: {
      zone: { include: { lot: true, pricingRules: true } },
    },
  });

  if (!spot) {
    return NextResponse.json({ error: "Spot not found" }, { status: 404 });
  }
  if (spot.status !== "AVAILABLE") {
    return NextResponse.json(
      { error: "This spot is no longer available" },
      { status: 409 }
    );
  }

  if (vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, userId: session.userId },
    });
    if (!vehicle) {
      return NextResponse.json(
        { error: "Vehicle not found for this user" },
        { status: 400 }
      );
    }
  }

  let resolvedVehicleId = vehicleId ?? null;
  if (!resolvedVehicleId && plateNumber) {
    const normalized = plateNumber.toUpperCase().replace(/\s+/g, "");
    const existing = await prisma.vehicle.findFirst({
      where: { plateNumber: normalized, userId: session.userId },
    });
    const vehicle = existing
      ? existing
      : await prisma.vehicle.create({
          data: { plateNumber: normalized, userId: session.userId },
        });
    resolvedVehicleId = vehicle.id;
  }

  const overlapping = await prisma.reservation.findFirst({
    where: {
      spotId,
      status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  if (overlapping) {
    return NextResponse.json(
      { error: "Spot is already reserved during the selected time" },
      { status: 409 }
    );
  }

  const totalPrice = calculateDynamicPrice(
    { priceMultiplier: spot.zone.priceMultiplier },
    spot.pricePerHour,
    start,
    end,
    spot.zone.pricingRules,
    spot.evCharging ? spot.zone.lot.evChargingRate : 0,
  );

  const reservation = await prisma.$transaction(async (tx) => {
    const created = await tx.reservation.create({
      data: {
        userId: session.userId,
        spotId: spot.id,
        vehicleId: resolvedVehicleId ?? null,
        startTime: start,
        endTime: end,
        totalPrice,
        status: "PENDING",
        qrCode: generateQrCode(),
      },
      include: {
        spot: { include: { zone: { include: { lot: true } } } },
      },
    });

    await tx.payment.create({
      data: {
        reservationId: created.id,
        amount: totalPrice,
        status: "PENDING",
        provider: "STRIPE",
      },
    });

    await tx.spot.update({
      where: { id: spot.id },
      data: { status: "RESERVED" },
    });

    return created;
  });

  const content = `Reservation for spot ${spot.zone.name} #${spot.number} at ${spot.zone.lot.name} is pending payment.`;
  await notifyUser({
    userId: session.userId,
    type: "RESERVATION_PENDING",
    content,
    relatedId: reservation.id,
  });

  return NextResponse.json({ reservation }, { status: 201 });
}