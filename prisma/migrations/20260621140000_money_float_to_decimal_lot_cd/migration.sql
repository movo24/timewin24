-- M101b LOT C+D — Float -> Decimal pour ventes POS et perf employé agrégée.
-- LOT C : PosSalesData.revenue/cardAmount/cashAmount/otherAmount.
-- LOT D : EmployeePerformanceDaily.totalSales/avgBasket/cashAmount/cardAmount/salesPerHour
--         + EmployeePerformanceHourly.sales.
-- € -> DECIMAL(12,2). Méthode `toNum` à la frontière : le calcul reste en number
-- (arithmétique inchangée), seul le STOCKAGE devient exact -> pas de dérive de parité.
-- `USING ::numeric` sûr même avec données existantes (conversion exacte double->numeric).
-- S'applique via `prisma migrate deploy` ou `prisma db push`.

-- LOT C — PosSalesData
ALTER TABLE "PosSalesData" ALTER COLUMN "revenue" TYPE DECIMAL(12,2) USING "revenue"::numeric(12,2);
ALTER TABLE "PosSalesData" ALTER COLUMN "cardAmount" TYPE DECIMAL(12,2) USING "cardAmount"::numeric(12,2);
ALTER TABLE "PosSalesData" ALTER COLUMN "cardAmount" SET DEFAULT 0;
ALTER TABLE "PosSalesData" ALTER COLUMN "cashAmount" TYPE DECIMAL(12,2) USING "cashAmount"::numeric(12,2);
ALTER TABLE "PosSalesData" ALTER COLUMN "cashAmount" SET DEFAULT 0;
ALTER TABLE "PosSalesData" ALTER COLUMN "otherAmount" TYPE DECIMAL(12,2) USING "otherAmount"::numeric(12,2);
ALTER TABLE "PosSalesData" ALTER COLUMN "otherAmount" SET DEFAULT 0;

-- LOT D — EmployeePerformanceDaily
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "totalSales" TYPE DECIMAL(12,2) USING "totalSales"::numeric(12,2);
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "totalSales" SET DEFAULT 0;
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "avgBasket" TYPE DECIMAL(12,2) USING "avgBasket"::numeric(12,2);
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "avgBasket" SET DEFAULT 0;
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "cashAmount" TYPE DECIMAL(12,2) USING "cashAmount"::numeric(12,2);
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "cashAmount" SET DEFAULT 0;
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "cardAmount" TYPE DECIMAL(12,2) USING "cardAmount"::numeric(12,2);
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "cardAmount" SET DEFAULT 0;
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "salesPerHour" TYPE DECIMAL(12,2) USING "salesPerHour"::numeric(12,2);
ALTER TABLE "EmployeePerformanceDaily" ALTER COLUMN "salesPerHour" SET DEFAULT 0;

-- LOT D — EmployeePerformanceHourly
ALTER TABLE "EmployeePerformanceHourly" ALTER COLUMN "sales" TYPE DECIMAL(12,2) USING "sales"::numeric(12,2);
ALTER TABLE "EmployeePerformanceHourly" ALTER COLUMN "sales" SET DEFAULT 0;
