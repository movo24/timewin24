-- CreateEnum
CREATE TYPE "ClockInStatus" AS ENUM ('ON_TIME', 'LATE', 'ABSENT');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ClockIn" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "photoPath" TEXT NOT NULL,
    "photoMimeType" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "status" "ClockInStatus" NOT NULL DEFAULT 'ON_TIME',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClockIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClockIn_shiftId_key" ON "ClockIn"("shiftId");

-- CreateIndex
CREATE INDEX "ClockIn_employeeId_clockInAt_idx" ON "ClockIn"("employeeId", "clockInAt");

-- CreateIndex
CREATE INDEX "ClockIn_storeId_clockInAt_idx" ON "ClockIn"("storeId", "clockInAt");

-- AddForeignKey
ALTER TABLE "ClockIn" ADD CONSTRAINT "ClockIn_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockIn" ADD CONSTRAINT "ClockIn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockIn" ADD CONSTRAINT "ClockIn_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
