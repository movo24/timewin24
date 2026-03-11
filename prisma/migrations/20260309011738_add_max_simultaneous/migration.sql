-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "maxSimultaneous" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "StoreSchedule" ADD COLUMN     "maxSimultaneous" INTEGER;
