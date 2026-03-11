-- CreateEnum
CREATE TYPE "ReplacementOfferStatus" AS ENUM ('OPEN', 'FILLED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReplacementCandidateStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ReplacementOffer" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "absentEmployeeId" TEXT NOT NULL,
    "absenceId" TEXT,
    "status" "ReplacementOfferStatus" NOT NULL DEFAULT 'OPEN',
    "filledByEmployeeId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplacementOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementCandidate" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "ReplacementCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplacementCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementOffer_shiftId_key" ON "ReplacementOffer"("shiftId");

-- CreateIndex
CREATE INDEX "ReplacementOffer_status_idx" ON "ReplacementOffer"("status");

-- CreateIndex
CREATE INDEX "ReplacementOffer_storeId_idx" ON "ReplacementOffer"("storeId");

-- CreateIndex
CREATE INDEX "ReplacementOffer_expiresAt_idx" ON "ReplacementOffer"("expiresAt");

-- CreateIndex
CREATE INDEX "ReplacementCandidate_employeeId_status_idx" ON "ReplacementCandidate"("employeeId", "status");

-- CreateIndex
CREATE INDEX "ReplacementCandidate_offerId_idx" ON "ReplacementCandidate"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementCandidate_offerId_employeeId_key" ON "ReplacementCandidate"("offerId", "employeeId");

-- AddForeignKey
ALTER TABLE "ReplacementOffer" ADD CONSTRAINT "ReplacementOffer_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementOffer" ADD CONSTRAINT "ReplacementOffer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementCandidate" ADD CONSTRAINT "ReplacementCandidate_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ReplacementOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementCandidate" ADD CONSTRAINT "ReplacementCandidate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
