-- CreateEnum
CREATE TYPE "PosProviderType" AS ENUM ('LIGHTSPEED', 'SQUARE', 'ZELTY', 'SUMUP', 'CUSTOM_API');

-- CreateEnum
CREATE TYPE "PosSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "PosSyncDirection" AS ENUM ('PUSH', 'PULL', 'BOTH');

-- CreateTable
CREATE TABLE "PosProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PosProviderType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "apiUrl" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "syncEmployees" BOOLEAN NOT NULL DEFAULT true,
    "syncTimeClock" BOOLEAN NOT NULL DEFAULT true,
    "syncSales" BOOLEAN NOT NULL DEFAULT false,
    "syncInterval" INTEGER NOT NULL DEFAULT 60,
    "webhookSecret" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "config" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosStoreLink" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "posStoreId" TEXT NOT NULL,
    "posStoreName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosStoreLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosEmployeeLink" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "posEmployeeId" TEXT NOT NULL,
    "posEmployeeName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosEmployeeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTimeClock" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "posRecordId" TEXT,
    "date" DATE NOT NULL,
    "clockIn" TEXT NOT NULL,
    "clockOut" TEXT,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedHours" DOUBLE PRECISION,
    "shiftId" TEXT,
    "deltaMinutes" INTEGER,
    "status" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosTimeClock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSalesData" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "posRecordId" TEXT,
    "date" DATE NOT NULL,
    "hourSlot" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "transactions" INTEGER NOT NULL DEFAULT 0,
    "itemsSold" INTEGER NOT NULL DEFAULT 0,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosSalesData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSyncLog" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "direction" "PosSyncDirection" NOT NULL,
    "status" "PosSyncStatus" NOT NULL,
    "entityType" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "details" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PosSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosProvider_webhookSecret_key" ON "PosProvider"("webhookSecret");

-- CreateIndex
CREATE INDEX "PosProvider_type_idx" ON "PosProvider"("type");

-- CreateIndex
CREATE INDEX "PosProvider_active_idx" ON "PosProvider"("active");

-- CreateIndex
CREATE INDEX "PosStoreLink_storeId_idx" ON "PosStoreLink"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PosStoreLink_providerId_storeId_key" ON "PosStoreLink"("providerId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PosStoreLink_providerId_posStoreId_key" ON "PosStoreLink"("providerId", "posStoreId");

-- CreateIndex
CREATE INDEX "PosEmployeeLink_employeeId_idx" ON "PosEmployeeLink"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PosEmployeeLink_providerId_employeeId_key" ON "PosEmployeeLink"("providerId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PosEmployeeLink_providerId_posEmployeeId_key" ON "PosEmployeeLink"("providerId", "posEmployeeId");

-- CreateIndex
CREATE INDEX "PosTimeClock_employeeId_date_idx" ON "PosTimeClock"("employeeId", "date");

-- CreateIndex
CREATE INDEX "PosTimeClock_storeId_date_idx" ON "PosTimeClock"("storeId", "date");

-- CreateIndex
CREATE INDEX "PosTimeClock_date_idx" ON "PosTimeClock"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PosTimeClock_providerId_posRecordId_key" ON "PosTimeClock"("providerId", "posRecordId");

-- CreateIndex
CREATE INDEX "PosSalesData_storeId_date_idx" ON "PosSalesData"("storeId", "date");

-- CreateIndex
CREATE INDEX "PosSalesData_date_idx" ON "PosSalesData"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PosSalesData_providerId_storeId_date_hourSlot_key" ON "PosSalesData"("providerId", "storeId", "date", "hourSlot");

-- CreateIndex
CREATE INDEX "PosSyncLog_providerId_startedAt_idx" ON "PosSyncLog"("providerId", "startedAt");

-- CreateIndex
CREATE INDEX "PosSyncLog_status_idx" ON "PosSyncLog"("status");

-- AddForeignKey
ALTER TABLE "PosStoreLink" ADD CONSTRAINT "PosStoreLink_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PosProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosEmployeeLink" ADD CONSTRAINT "PosEmployeeLink_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PosProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTimeClock" ADD CONSTRAINT "PosTimeClock_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PosProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSalesData" ADD CONSTRAINT "PosSalesData_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PosProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSyncLog" ADD CONSTRAINT "PosSyncLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PosProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
