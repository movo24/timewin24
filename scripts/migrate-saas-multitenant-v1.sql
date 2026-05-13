-- ════════════════════════════════════════════════════════════════════════════
-- Migration additive — TimeWin24 SaaS multi-tenant v1
-- ════════════════════════════════════════════════════════════════════════════
--
-- Branch  : appstore-saas
-- Target  : NOUVELLE DB Neon dédiée SaaS uniquement.
--           NE JAMAIS exécuter sur la DB production actuelle.
-- Pattern : idempotent (IF NOT EXISTS partout) — safe à re-jouer.
-- Effect  : strictement additif. Aucune colonne ou table existante n'est
--           supprimée ou renommée. Tous les `companyId` sont créés NULLABLES
--           pour permettre la migration d'une DB peuplée sans rollback.
--
-- Phase suivante (NOT IN THIS SCRIPT) :
--   1. Backfill   : UPDATE pour assigner un companyId à chaque ligne existante
--   2. NOT NULL   : ALTER COLUMN companyId SET NOT NULL une fois backfill OK
--   3. Code       : routes API filtrent toutes leurs queries par companyId
--
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Enums ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Enum CompanyStatus (nouveau)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyStatus') THEN
    CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
  END IF;

  -- Enum Role : ajout valeur OWNER (au-dessus d'ADMIN dans la sémantique)
  -- PG 12+ supporte ADD VALUE IF NOT EXISTS
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'OWNER'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'OWNER';
  END IF;
END$$;

-- ─── 2. Table Company ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Company" (
  "id"             TEXT PRIMARY KEY,
  "name"           TEXT NOT NULL,
  "country"        TEXT NOT NULL DEFAULT 'FR',
  "timezone"       TEXT NOT NULL DEFAULT 'Europe/Paris',
  "language"       TEXT NOT NULL DEFAULT 'fr',
  "contactEmail"   TEXT,
  "status"         "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "onboardingStep" INTEGER NOT NULL DEFAULT 0,
  "deletedAt"      TIMESTAMP(3),
  "appleSub"       TEXT UNIQUE,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Company_status_idx"    ON "Company" ("status");
CREATE INDEX IF NOT EXISTS "Company_deletedAt_idx" ON "Company" ("deletedAt");

-- ─── 3. Ajout companyId sur les modèles cibles (NULLABLE) ──────────────────
-- Chaque ALTER est idempotent via "ADD COLUMN IF NOT EXISTS" (PG 9.6+).

ALTER TABLE "User"                  ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Store"                 ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Employee"              ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "StoreEmployee"         ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Shift"                 ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Unavailability"        ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "PlanningNotification"  ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "AuditLog"              ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "HrMessage"             ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "ClockIn"               ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "AbsenceDeclaration"    ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- ─── 4. Foreign keys (idempotent via DO block) ─────────────────────────────

DO $$
DECLARE
  fk_name TEXT;
  tbl     TEXT;
  ondel   TEXT;
  pair    RECORD;
BEGIN
  FOR pair IN
    SELECT *
    FROM (VALUES
      ('User',                  'SET NULL'),    -- préserver compte si Company supprimée (cas SUPER_ADMIN)
      ('Store',                 'CASCADE'),     -- Company supprimée → sites supprimés
      ('Employee',              'CASCADE'),
      ('StoreEmployee',         'CASCADE'),
      ('Shift',                 'CASCADE'),
      ('Unavailability',        'CASCADE'),
      ('PlanningNotification',  'SET NULL'),    -- préserver l'audit RH/légal
      ('AuditLog',              'SET NULL'),    -- préserver l'audit
      ('HrMessage',             'CASCADE'),
      ('ClockIn',               'CASCADE'),
      ('AbsenceDeclaration',    'CASCADE')
    ) AS t(table_name, on_delete_action)
  LOOP
    tbl     := pair.table_name;
    ondel   := pair.on_delete_action;
    fk_name := tbl || '_companyId_fkey';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = fk_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I
           ADD CONSTRAINT %I
           FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE %s',
        tbl, fk_name, ondel
      );
    END IF;
  END LOOP;
END$$;

-- ─── 5. Index sur companyId (idempotents) ──────────────────────────────────

CREATE INDEX IF NOT EXISTS "User_companyId_role_idx"
  ON "User" ("companyId", "role");

CREATE INDEX IF NOT EXISTS "Store_companyId_idx"
  ON "Store" ("companyId");

CREATE INDEX IF NOT EXISTS "Employee_companyId_active_idx"
  ON "Employee" ("companyId", "active");

CREATE INDEX IF NOT EXISTS "StoreEmployee_companyId_idx"
  ON "StoreEmployee" ("companyId");

CREATE INDEX IF NOT EXISTS "Shift_companyId_date_idx"
  ON "Shift" ("companyId", "date");

CREATE INDEX IF NOT EXISTS "Unavailability_companyId_idx"
  ON "Unavailability" ("companyId");

CREATE INDEX IF NOT EXISTS "PlanningNotification_companyId_sentAt_idx"
  ON "PlanningNotification" ("companyId", "sentAt");

CREATE INDEX IF NOT EXISTS "AuditLog_companyId_createdAt_idx"
  ON "AuditLog" ("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "HrMessage_companyId_idx"
  ON "HrMessage" ("companyId");

CREATE INDEX IF NOT EXISTS "ClockIn_companyId_idx"
  ON "ClockIn" ("companyId");

CREATE INDEX IF NOT EXISTS "AbsenceDeclaration_companyId_idx"
  ON "AbsenceDeclaration" ("companyId");

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter manuellement après application)
-- ════════════════════════════════════════════════════════════════════════════
--
-- SELECT table_name
-- FROM information_schema.columns
-- WHERE column_name = 'companyId'
--   AND table_schema = 'public'
-- ORDER BY table_name;
--
-- (Attendu : 11 tables — User, Store, Employee, StoreEmployee, Shift,
--  Unavailability, PlanningNotification, AuditLog, HrMessage, ClockIn,
--  AbsenceDeclaration)
--
-- SELECT typname FROM pg_type WHERE typname = 'CompanyStatus';
-- (Attendu : 1 ligne)
--
-- SELECT enumlabel FROM pg_enum
-- WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')
-- ORDER BY enumsortorder;
-- (Attendu : SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, OWNER)
-- ════════════════════════════════════════════════════════════════════════════
