-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CDI', 'CDD', 'INTERIM', 'EXTRA', 'STAGE');

-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('CAISSE', 'OUVERTURE', 'FERMETURE', 'GESTION', 'MANAGER', 'CONSEIL', 'STOCK', 'SAV');

-- CreateEnum
CREATE TYPE "UnavailabilityType" AS ENUM ('FIXED', 'VARIABLE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "passwordResetToken" TEXT,
    "passwordResetExpiry" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "timezone" TEXT DEFAULT 'Europe/Paris',
    "minEmployees" INTEGER DEFAULT 1,
    "needsManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSchedule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT DEFAULT '09:00',
    "closeTime" TEXT DEFAULT '20:00',
    "minEmployees" INTEGER,

    CONSTRAINT "StoreSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "weeklyHours" DOUBLE PRECISION,
    "contractType" "ContractType",
    "priority" INTEGER NOT NULL DEFAULT 1,
    "maxHoursPerDay" DOUBLE PRECISION DEFAULT 10,
    "maxHoursPerWeek" DOUBLE PRECISION DEFAULT 48,
    "minRestBetween" DOUBLE PRECISION DEFAULT 11,
    "skills" "SkillType"[],
    "preferredStoreId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unavailability" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "UnavailabilityType" NOT NULL,
    "dayOfWeek" INTEGER,
    "date" DATE,
    "startTime" TEXT,
    "endTime" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreEmployee" (
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreEmployee_pkey" PRIMARY KEY ("storeId","employeeId")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "minimumWageHour" DOUBLE PRECISION NOT NULL,
    "employerRate" DOUBLE PRECISION NOT NULL,
    "reductionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reductionMaxCoeff" DOUBLE PRECISION NOT NULL DEFAULT 0.3206,
    "reductionThreshold" DOUBLE PRECISION NOT NULL DEFAULT 1.6,
    "extraHourlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCost" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "hourlyRateGross" DOUBLE PRECISION NOT NULL,
    "fixedMissionCost" DOUBLE PRECISION,
    "employerRateOverride" DOUBLE PRECISION,
    "extraHourlyCostOverride" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_passwordResetToken_idx" ON "User"("passwordResetToken");

-- CreateIndex
CREATE INDEX "Store_name_idx" ON "Store"("name");

-- CreateIndex
CREATE INDEX "Store_city_idx" ON "Store"("city");

-- CreateIndex
CREATE INDEX "StoreSchedule_storeId_idx" ON "StoreSchedule"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSchedule_storeId_dayOfWeek_key" ON "StoreSchedule"("storeId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_email_idx" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_employeeCode_idx" ON "Employee"("employeeCode");

-- CreateIndex
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Employee_contractType_idx" ON "Employee"("contractType");

-- CreateIndex
CREATE INDEX "Unavailability_employeeId_idx" ON "Unavailability"("employeeId");

-- CreateIndex
CREATE INDEX "Unavailability_employeeId_type_idx" ON "Unavailability"("employeeId", "type");

-- CreateIndex
CREATE INDEX "Unavailability_date_idx" ON "Unavailability"("date");

-- CreateIndex
CREATE INDEX "StoreEmployee_storeId_idx" ON "StoreEmployee"("storeId");

-- CreateIndex
CREATE INDEX "StoreEmployee_employeeId_idx" ON "StoreEmployee"("employeeId");

-- CreateIndex
CREATE INDEX "Shift_storeId_date_idx" ON "Shift"("storeId", "date");

-- CreateIndex
CREATE INDEX "Shift_employeeId_date_idx" ON "Shift"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Shift_date_idx" ON "Shift"("date");

-- CreateIndex
CREATE UNIQUE INDEX "CountryConfig_code_key" ON "CountryConfig"("code");

-- CreateIndex
CREATE INDEX "CountryConfig_code_idx" ON "CountryConfig"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCost_employeeId_key" ON "EmployeeCost"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCost_employeeId_idx" ON "EmployeeCost"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCost_countryCode_idx" ON "EmployeeCost"("countryCode");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSchedule" ADD CONSTRAINT "StoreSchedule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unavailability" ADD CONSTRAINT "Unavailability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEmployee" ADD CONSTRAINT "StoreEmployee_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreEmployee" ADD CONSTRAINT "StoreEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCost" ADD CONSTRAINT "EmployeeCost_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCost" ADD CONSTRAINT "EmployeeCost_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "CountryConfig"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
