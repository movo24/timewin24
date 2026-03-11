-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('INCIDENT', 'NOTE', 'OBSERVATION');

-- CreateEnum
CREATE TYPE "JournalSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "JournalEntryType" NOT NULL,
    "severity" "JournalSeverity" NOT NULL DEFAULT 'LOW',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_storeId_date_idx" ON "JournalEntry"("storeId", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");
