-- M101b LOT A+B — Float -> Decimal pour montants/taux hors paie.
-- LOT A (taux/%) : Store.vatRate, Product.vatRate, Employee.maxDiscountPct.
-- LOT B (catalogue/étiquettes) : Product.price/oldPrice, LabelPrintItem.priceAtPrint.
-- € -> DECIMAL(12,2) ; taux/% -> DECIMAL(6,4) / (5,2).
-- Migration additive-équivalente (prod sans données monétaires). `USING ::numeric`
-- reste sûr même si des lignes existent (conversion exacte double->numeric).
-- S'applique via `prisma migrate deploy` ou `prisma db push`.

-- LOT A — taux / %
ALTER TABLE "Store" ALTER COLUMN "vatRate" TYPE DECIMAL(6,4) USING "vatRate"::numeric(6,4);
ALTER TABLE "Store" ALTER COLUMN "vatRate" SET DEFAULT 20;
ALTER TABLE "Product" ALTER COLUMN "vatRate" TYPE DECIMAL(6,4) USING "vatRate"::numeric(6,4);
ALTER TABLE "Employee" ALTER COLUMN "maxDiscountPct" TYPE DECIMAL(5,2) USING "maxDiscountPct"::numeric(5,2);
ALTER TABLE "Employee" ALTER COLUMN "maxDiscountPct" SET DEFAULT 0;

-- LOT B — montants € catalogue / étiquettes
ALTER TABLE "Product" ALTER COLUMN "price" TYPE DECIMAL(12,2) USING "price"::numeric(12,2);
ALTER TABLE "Product" ALTER COLUMN "oldPrice" TYPE DECIMAL(12,2) USING "oldPrice"::numeric(12,2);
ALTER TABLE "LabelPrintItem" ALTER COLUMN "priceAtPrint" TYPE DECIMAL(12,2) USING "priceAtPrint"::numeric(12,2);
