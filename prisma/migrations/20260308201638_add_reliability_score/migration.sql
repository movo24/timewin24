-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "reliabilityScore" INTEGER,
ADD COLUMN     "scoreUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReliabilityScoreHistory" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "punctualityScore" INTEGER NOT NULL,
    "attendanceScore" INTEGER NOT NULL,
    "replacementScore" INTEGER NOT NULL,
    "planningScore" INTEGER NOT NULL,
    "transparencyScore" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metrics" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReliabilityScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReliabilityScoreHistory_employeeId_idx" ON "ReliabilityScoreHistory"("employeeId");

-- CreateIndex
CREATE INDEX "ReliabilityScoreHistory_createdAt_idx" ON "ReliabilityScoreHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReliabilityScoreHistory_employeeId_periodStart_key" ON "ReliabilityScoreHistory"("employeeId", "periodStart");
