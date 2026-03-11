-- CreateEnum
CREATE TYPE "HrMessageStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HrMessageCategory" AS ENUM ('GENERAL', 'PLANNING', 'CONGE', 'ABSENCE', 'ADMINISTRATIF', 'RECLAMATION', 'AUTRE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HrMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "HrMessageCategory" NOT NULL DEFAULT 'GENERAL',
    "status" "HrMessageStatus" NOT NULL DEFAULT 'NEW',
    "handlerId" TEXT,
    "parentId" TEXT,
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrMessage_senderId_idx" ON "HrMessage"("senderId");

-- CreateIndex
CREATE INDEX "HrMessage_employeeId_idx" ON "HrMessage"("employeeId");

-- CreateIndex
CREATE INDEX "HrMessage_storeId_idx" ON "HrMessage"("storeId");

-- CreateIndex
CREATE INDEX "HrMessage_status_idx" ON "HrMessage"("status");

-- CreateIndex
CREATE INDEX "HrMessage_parentId_idx" ON "HrMessage"("parentId");

-- CreateIndex
CREATE INDEX "HrMessage_createdAt_idx" ON "HrMessage"("createdAt");

-- CreateIndex
CREATE INDEX "HrMessage_category_status_idx" ON "HrMessage"("category", "status");

-- AddForeignKey
ALTER TABLE "HrMessage" ADD CONSTRAINT "HrMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrMessage" ADD CONSTRAINT "HrMessage_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrMessage" ADD CONSTRAINT "HrMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "HrMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
