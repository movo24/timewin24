-- M101 — Argent/coefficients : Float (double precision) -> Decimal (numeric exact).
-- Périmètre : noyau paie/coût employeur (CountryConfig + EmployeeCost).
-- Montants € -> DECIMAL(12,2) ; coefficients/taux -> DECIMAL(6,4).
-- Migration ADDITIVE-équivalente : exécutée alors que la prod ne contient pas
-- encore de données monétaires (fenêtre idéale). Le `USING ::numeric` reste sûr
-- même si des lignes existent (conversion exacte double->numeric).
-- S'applique via `prisma migrate deploy` ou `prisma db push`.

-- CountryConfig
ALTER TABLE "CountryConfig" ALTER COLUMN "minimumWageHour" TYPE DECIMAL(12,2) USING "minimumWageHour"::numeric(12,2);
ALTER TABLE "CountryConfig" ALTER COLUMN "employerRate" TYPE DECIMAL(6,4) USING "employerRate"::numeric(6,4);
ALTER TABLE "CountryConfig" ALTER COLUMN "reductionMaxCoeff" TYPE DECIMAL(6,4) USING "reductionMaxCoeff"::numeric(6,4);
ALTER TABLE "CountryConfig" ALTER COLUMN "reductionMaxCoeff" SET DEFAULT 0.3206;
ALTER TABLE "CountryConfig" ALTER COLUMN "reductionThreshold" TYPE DECIMAL(6,4) USING "reductionThreshold"::numeric(6,4);
ALTER TABLE "CountryConfig" ALTER COLUMN "reductionThreshold" SET DEFAULT 1.6;
ALTER TABLE "CountryConfig" ALTER COLUMN "extraHourlyCost" TYPE DECIMAL(12,2) USING "extraHourlyCost"::numeric(12,2);
ALTER TABLE "CountryConfig" ALTER COLUMN "extraHourlyCost" SET DEFAULT 0;

-- EmployeeCost
ALTER TABLE "EmployeeCost" ALTER COLUMN "hourlyRateGross" TYPE DECIMAL(12,2) USING "hourlyRateGross"::numeric(12,2);
ALTER TABLE "EmployeeCost" ALTER COLUMN "fixedMissionCost" TYPE DECIMAL(12,2) USING "fixedMissionCost"::numeric(12,2);
ALTER TABLE "EmployeeCost" ALTER COLUMN "employerRateOverride" TYPE DECIMAL(6,4) USING "employerRateOverride"::numeric(6,4);
ALTER TABLE "EmployeeCost" ALTER COLUMN "extraHourlyCostOverride" TYPE DECIMAL(12,2) USING "extraHourlyCostOverride"::numeric(12,2);
