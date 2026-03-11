-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "allowOverlap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxOverlapMinutes" INTEGER NOT NULL DEFAULT 0;
