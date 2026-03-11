-- CreateEnum
CREATE TYPE "MarketListingStatus" AS ENUM ('OPEN', 'CLAIMED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ShiftMarketListing" (
    "id" TEXT NOT NULL,
    "posterId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "claimantId" TEXT,
    "status" "MarketListingStatus" NOT NULL DEFAULT 'OPEN',
    "posterMessage" TEXT,
    "claimantMessage" TEXT,
    "managerResponse" TEXT,
    "constraintChecks" TEXT,
    "claimedAt" TIMESTAMP(3),
    "managerRespondedAt" TIMESTAMP(3),
    "managerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftMarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftMarketListing_status_idx" ON "ShiftMarketListing"("status");

-- CreateIndex
CREATE INDEX "ShiftMarketListing_storeId_status_idx" ON "ShiftMarketListing"("storeId", "status");

-- CreateIndex
CREATE INDEX "ShiftMarketListing_posterId_idx" ON "ShiftMarketListing"("posterId");

-- CreateIndex
CREATE INDEX "ShiftMarketListing_claimantId_idx" ON "ShiftMarketListing"("claimantId");

-- CreateIndex
CREATE INDEX "ShiftMarketListing_expiresAt_idx" ON "ShiftMarketListing"("expiresAt");
