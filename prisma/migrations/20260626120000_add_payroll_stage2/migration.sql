-- Migration: Payroll Inputs — Étage 2 (Establishment / EmploymentContract / PayrollInput)
--
-- 100 % ADDITIVE : aucune table existante modifiée. SQL généré via
-- `prisma migrate diff` (schéma au dernier commit de migration -> schéma courant).
-- Reconstruit a posteriori pour refermer la dérive schema.prisma <-> migrations/
-- (les modèles avaient été livrés via `prisma db push` sans fichier de migration).
-- S'applique via `prisma migrate deploy` (installation neuve) ou `prisma db push`.
--
-- FRONTIÈRE PAIE : quantités uniquement (heures/jours/minutes), aucun montant.

-- CreateTable
CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "siret" TEXT,
    "legalName" TEXT,
    "apeCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "weeklyHours" DOUBLE PRECISION NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollInput" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "totalWorkedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "normalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complementaryHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sundayHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holidayHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sickOrAccidentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAbsenceDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latenessMinutes" INTEGER NOT NULL DEFAULT 0,
    "manualEntries" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validatedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollInput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_storeId_key" ON "Establishment"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_siret_key" ON "Establishment"("siret");

-- CreateIndex
CREATE INDEX "EmploymentContract_employeeId_idx" ON "EmploymentContract"("employeeId");

-- CreateIndex
CREATE INDEX "EmploymentContract_establishmentId_idx" ON "EmploymentContract"("establishmentId");

-- CreateIndex
CREATE INDEX "PayrollInput_period_idx" ON "PayrollInput"("period");

-- CreateIndex
CREATE INDEX "PayrollInput_status_idx" ON "PayrollInput"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollInput_contractId_period_key" ON "PayrollInput"("contractId", "period");

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInput" ADD CONSTRAINT "PayrollInput_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "EmploymentContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
