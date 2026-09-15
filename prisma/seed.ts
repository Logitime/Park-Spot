import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" });
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Seeding database...");

  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  await prisma.user.upsert({
    where: { email: "admin@parking.com" },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@parking.com",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: "operator@parking.com" },
    update: {},
    create: {
      name: "Lot Operator",
      email: "operator@parking.com",
      password: userPassword,
      role: "OPERATOR",
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: "user@parking.com" },
    update: {},
    create: {
      name: "Demo User",
      email: "user@parking.com",
      password: userPassword,
      role: "USER",
    },
  });

  await prisma.vehicle.upsert({
    where: { id: "demo-vehicle-1" },
    update: {},
    create: {
      id: "demo-vehicle-1",
      userId: demoUser.id,
      plateNumber: "ABC-1234",
      type: "CAR",
      color: "Blue",
    },
  });

  const lots = [
    {
      id: "lot-1",
      name: "Downtown Plaza Garage",
      address: "100 Main Street, Downtown",
      latitude: 40.7128,
      longitude: -74.006,
      totalSpots: 120,
      baseHourlyRate: 3.5,
      operatorId: operator.id,
    },
    {
      id: "lot-2",
      name: "Airport Long-Term Parking",
      address: "1 Airport Way, Terminal District",
      latitude: 40.6413,
      longitude: -73.7781,
      totalSpots: 500,
      baseHourlyRate: 2.0,
      operatorId: operator.id,
    },
    {
      id: "lot-3",
      name: "Central Mall Parking",
      address: "250 Commerce Boulevard",
      latitude: 40.758,
      longitude: -73.9855,
      totalSpots: 200,
      baseHourlyRate: 2.5,
      operatorId: operator.id,
    },
  ];

  for (const lot of lots) {
    await prisma.parkingLot.upsert({
      where: { id: lot.id },
      update: {},
      create: lot,
    });
  }

  // Zones and spots for Downtown Plaza
  const zones = [
    { id: "zone-1a", lotId: "lot-1", name: "Floor A - General", floor: 1, priceMultiplier: 1.0 },
    { id: "zone-1b", lotId: "lot-1", name: "Floor B - Compact", floor: 2, priceMultiplier: 0.8 },
    { id: "zone-1c", lotId: "lot-1", name: "Floor C - VIP/EV", floor: 3, priceMultiplier: 1.5 },
    { id: "zone-2a", lotId: "lot-2", name: "Level 1 - Economy", floor: 1, priceMultiplier: 1.0 },
    { id: "zone-2b", lotId: "lot-2", name: "Level 2 - Standard", floor: 2, priceMultiplier: 1.2 },
    { id: "zone-2c", lotId: "lot-2", name: "Level 3 - Covered", floor: 3, priceMultiplier: 1.4 },
    { id: "zone-3a", lotId: "lot-3", name: "Ground Floor", floor: 0, priceMultiplier: 1.0 },
    { id: "zone-3b", lotId: "lot-3", name: "Upper Deck", floor: 1, priceMultiplier: 1.1 },
  ];

  for (const zone of zones) {
    await prisma.zone.upsert({
      where: { id: zone.id },
      update: {},
      create: zone,
    });
  }

  const pricingRules = [
    { id: "rule-1a-weekday-peak", zoneId: "zone-1a", name: "Weekday evening peak", dayOfWeek: null, startHour: 16, endHour: 19, multiplier: 1.4 },
    { id: "rule-1a-weekend", zoneId: "zone-1a", name: "Weekend mid-day", dayOfWeek: null, startHour: 10, endHour: 20, multiplier: 1.2 },
    { id: "rule-1a-overnight", zoneId: "zone-1a", name: "Overnight discount", dayOfWeek: null, startHour: 22, endHour: 24, multiplier: 0.7 },
    { id: "rule-1c-premium", zoneId: "zone-1c", name: "VIP peak", dayOfWeek: null, startHour: 16, endHour: 19, multiplier: 1.3 },
    { id: "rule-2a-economy", zoneId: "zone-2a", name: "Early bird", dayOfWeek: null, startHour: 5, endHour: 9, multiplier: 0.8 },
    { id: "rule-3a-mall", zoneId: "zone-3a", name: "Weekend demand", dayOfWeek: null, startHour: 12, endHour: 18, multiplier: 1.25 },
  ];

  for (const rule of pricingRules) {
    await prisma.pricingRule.upsert({
      where: { id: rule.id },
      update: { multiplier: rule.multiplier, startHour: rule.startHour, endHour: rule.endHour },
      create: rule,
    });
  }

  const statuses = ["AVAILABLE", "OCCUPIED", "RESERVED"];
  const sizes = ["COMPACT", "STANDARD", "LARGE"];

  const spotConfigs: { zoneId: string; count: number; basePrice: number }[] = [
    { zoneId: "zone-1a", count: 20, basePrice: 3.5 },
    { zoneId: "zone-1b", count: 15, basePrice: 2.8 },
    { zoneId: "zone-1c", count: 10, basePrice: 5.25 },
    { zoneId: "zone-2a", count: 40, basePrice: 2.0 },
    { zoneId: "zone-2b", count: 30, basePrice: 2.4 },
    { zoneId: "zone-2c", count: 20, basePrice: 2.8 },
    { zoneId: "zone-3a", count: 25, basePrice: 2.5 },
    { zoneId: "zone-3b", count: 20, basePrice: 2.75 },
  ];

  for (const cfg of spotConfigs) {
    for (let i = 1; i <= cfg.count; i++) {
      const evCharging = cfg.zoneId === "zone-1c" || (cfg.zoneId === "zone-3a" && i <= 5);
      const accessible = i <= 2;
      const size = sizes[Math.floor(Math.random() * sizes.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      await prisma.spot.upsert({
        where: { zoneId_number: { zoneId: cfg.zoneId, number: i } },
        update: { status, size, evCharging, accessible },
        create: {
          zoneId: cfg.zoneId,
          number: i,
          size,
          evCharging,
          accessible,
          status,
          pricePerHour: cfg.basePrice,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log("  Admin:    admin@parking.com / admin123");
  console.log("  Operator: operator@parking.com / user123");
  console.log("  User:     user@parking.com / user123");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });