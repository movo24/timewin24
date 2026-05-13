-- ─── Migration v2 : preserve audit trail when employees / users are deleted ──
-- Idempotent: safe to re-run.
-- Changes:
--   1. employeeId / sentByUserId become nullable (was NOT NULL)
--   2. FK changes: Cascade → SetNull (preserves the row when parent is deleted)
--   3. New columns: employeeSnapshot, sentByUserSnapshot (preserve names)

-- ─── 1) Make employeeId / sentByUserId nullable ──────────────────────────
ALTER TABLE "PlanningNotification"
  ALTER COLUMN "employeeId" DROP NOT NULL;

ALTER TABLE "PlanningNotification"
  ALTER COLUMN "sentByUserId" DROP NOT NULL;

-- ─── 2) Replace FK constraints (Cascade → SetNull) ───────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlanningNotification_employeeId_fkey'
  ) THEN
    ALTER TABLE "PlanningNotification" DROP CONSTRAINT "PlanningNotification_employeeId_fkey";
  END IF;
  ALTER TABLE "PlanningNotification"
    ADD CONSTRAINT "PlanningNotification_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlanningNotification_sentByUserId_fkey'
  ) THEN
    ALTER TABLE "PlanningNotification" DROP CONSTRAINT "PlanningNotification_sentByUserId_fkey";
  END IF;
  ALTER TABLE "PlanningNotification"
    ADD CONSTRAINT "PlanningNotification_sentByUserId_fkey"
    FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
END$$;

-- ─── 3) Add snapshot columns ─────────────────────────────────────────────
ALTER TABLE "PlanningNotification"
  ADD COLUMN IF NOT EXISTS "employeeSnapshot"   TEXT,
  ADD COLUMN IF NOT EXISTS "sentByUserSnapshot" TEXT;
