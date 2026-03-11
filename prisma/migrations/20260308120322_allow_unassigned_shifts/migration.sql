-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_employeeId_fkey";

-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "employeeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
