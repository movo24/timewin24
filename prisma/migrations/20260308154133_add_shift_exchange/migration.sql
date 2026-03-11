-- CreateEnum
CREATE TYPE "ShiftExchangeStatus" AS ENUM ('PENDING_PEER', 'PENDING_MANAGER', 'APPROVED', 'REJECTED_PEER', 'REJECTED_MANAGER', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ShiftExchange" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterShiftId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetShiftId" TEXT,
    "status" "ShiftExchangeStatus" NOT NULL DEFAULT 'PENDING_PEER',
    "message" TEXT,
    "peerResponse" TEXT,
    "managerResponse" TEXT,
    "peerRespondedAt" TIMESTAMP(3),
    "managerRespondedAt" TIMESTAMP(3),
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ShiftExchange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftExchange_requesterId_idx" ON "ShiftExchange"("requesterId");

-- CreateIndex
CREATE INDEX "ShiftExchange_targetId_idx" ON "ShiftExchange"("targetId");

-- CreateIndex
CREATE INDEX "ShiftExchange_status_idx" ON "ShiftExchange"("status");

-- CreateIndex
CREATE INDEX "ShiftExchange_createdAt_idx" ON "ShiftExchange"("createdAt");
