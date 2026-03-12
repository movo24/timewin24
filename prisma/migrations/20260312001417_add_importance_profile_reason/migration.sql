-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "profileCategory" TEXT;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "assignmentReason" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "importance" INTEGER NOT NULL DEFAULT 2;
