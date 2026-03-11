-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('MALADIE', 'CONGE', 'PERSONNEL', 'ACCIDENT', 'AUTRE');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AbsenceDeclaration" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "AbsenceType" NOT NULL,
    "reason" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "documentPath" TEXT,
    "documentName" TEXT,
    "documentMime" TEXT,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'PENDING',
    "managerId" TEXT,
    "managerResponse" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbsenceDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbsenceDeclaration_employeeId_idx" ON "AbsenceDeclaration"("employeeId");

-- CreateIndex
CREATE INDEX "AbsenceDeclaration_status_idx" ON "AbsenceDeclaration"("status");

-- CreateIndex
CREATE INDEX "AbsenceDeclaration_startDate_endDate_idx" ON "AbsenceDeclaration"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "AbsenceDeclaration_createdAt_idx" ON "AbsenceDeclaration"("createdAt");

-- AddForeignKey
ALTER TABLE "AbsenceDeclaration" ADD CONSTRAINT "AbsenceDeclaration_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
