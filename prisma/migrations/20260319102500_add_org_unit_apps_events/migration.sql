-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConnectedAppStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR', 'SYNCING');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "maxDiscountPct" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "posPin" TEXT,
ADD COLUMN     "posQrCode" TEXT,
ADD COLUMN     "posRole" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "country" TEXT DEFAULT 'FR',
ADD COLUMN     "currency" TEXT DEFAULT 'EUR',
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "storeCode" TEXT,
ADD COLUMN     "unitId" TEXT,
ADD COLUMN     "vatRate" DOUBLE PRECISION DEFAULT 20;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "siret" TEXT,
    "siren" TEXT,
    "vatNumber" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "logo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'region',
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "organizationId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT,
    "status" "ConnectedAppStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "apiUrl" TEXT,
    "apiKey" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "storeId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorMsg" TEXT,
    "syncInterval" INTEGER NOT NULL DEFAULT 60,
    "config" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "Unit_organizationId_idx" ON "Unit"("organizationId");

-- CreateIndex
CREATE INDEX "Unit_name_idx" ON "Unit"("name");

-- CreateIndex
CREATE INDEX "Unit_status_idx" ON "Unit"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedApp_webhookSecret_key" ON "ConnectedApp"("webhookSecret");

-- CreateIndex
CREATE INDEX "ConnectedApp_status_idx" ON "ConnectedApp"("status");

-- CreateIndex
CREATE INDEX "ConnectedApp_type_idx" ON "ConnectedApp"("type");

-- CreateIndex
CREATE INDEX "ConnectedApp_storeId_idx" ON "ConnectedApp"("storeId");

-- CreateIndex
CREATE INDEX "PosEvent_storeId_createdAt_idx" ON "PosEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "PosEvent_eventType_idx" ON "PosEvent"("eventType");

-- CreateIndex
CREATE INDEX "PosEvent_processedAt_idx" ON "PosEvent"("processedAt");

-- CreateIndex
CREATE INDEX "PosEvent_createdAt_idx" ON "PosEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Store_storeCode_key" ON "Store"("storeCode");

-- CreateIndex
CREATE INDEX "Store_status_idx" ON "Store"("status");

-- CreateIndex
CREATE INDEX "Store_unitId_idx" ON "Store"("unitId");

-- CreateIndex
CREATE INDEX "Store_storeCode_idx" ON "Store"("storeCode");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedApp" ADD CONSTRAINT "ConnectedApp_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosEvent" ADD CONSTRAINT "PosEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

