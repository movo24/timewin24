-- CreateEnum
CREATE TYPE "ShiftPreference" AS ENUM ('MATIN', 'APRES_MIDI', 'JOURNEE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "shiftPreference" "ShiftPreference" NOT NULL DEFAULT 'JOURNEE',
ALTER COLUMN "maxHoursPerDay" SET DEFAULT 11;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "maxEmployees" INTEGER;

-- AlterTable
ALTER TABLE "StoreSchedule" ADD COLUMN     "maxEmployees" INTEGER;
