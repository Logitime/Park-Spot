-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PricingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "multiplierBefore" REAL NOT NULL,
    "multiplierAfter" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByRole" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingEvent_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ParkingLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "totalSpots" INTEGER NOT NULL,
    "baseHourlyRate" REAL NOT NULL DEFAULT 2.0,
    "evChargingRate" REAL NOT NULL DEFAULT 0.5,
    "operatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ParkingLot_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ParkingLot" ("address", "baseHourlyRate", "createdAt", "id", "latitude", "longitude", "name", "operatorId", "totalSpots") SELECT "address", "baseHourlyRate", "createdAt", "id", "latitude", "longitude", "name", "operatorId", "totalSpots" FROM "ParkingLot";
DROP TABLE "ParkingLot";
ALTER TABLE "new_ParkingLot" RENAME TO "ParkingLot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
