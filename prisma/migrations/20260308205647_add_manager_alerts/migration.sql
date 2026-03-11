-- CreateEnum
CREATE TYPE "ManagerAlertType" AS ENUM ('STORE_NOT_OPENED', 'ABSENCE_NOT_REPLACED', 'SIGNIFICANT_LATENESS', 'INCOMPLETE_TEAM');

-- CreateEnum
CREATE TYPE "ManagerAlertStatus" AS ENUM ('UNREAD', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ManagerAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "ManagerAlert" (
    "id" TEXT NOT NULL,
    "type" "ManagerAlertType" NOT NULL,
    "severity" "ManagerAlertSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "ManagerAlertStatus" NOT NULL DEFAULT 'UNREAD',
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "contextKey" TEXT NOT NULL,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerAlert_storeId_date_idx" ON "ManagerAlert"("storeId", "date");

-- CreateIndex
CREATE INDEX "ManagerAlert_status_idx" ON "ManagerAlert"("status");

-- CreateIndex
CREATE INDEX "ManagerAlert_type_status_idx" ON "ManagerAlert"("type", "status");

-- CreateIndex
CREATE INDEX "ManagerAlert_createdAt_idx" ON "ManagerAlert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerAlert_type_storeId_date_contextKey_key" ON "ManagerAlert"("type", "storeId", "date", "contextKey");

-- AddForeignKey
ALTER TABLE "ManagerAlert" ADD CONSTRAINT "ManagerAlert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
