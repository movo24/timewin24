-- Surgical migration for PlanningNotification feature.
-- Idempotent (safe to re-run). Does NOT touch any other table.

-- ─── Enum ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanningNotificationStatus') THEN
    CREATE TYPE "PlanningNotificationStatus" AS ENUM ('SENT', 'FAILED', 'NO_EMAIL', 'PARTIAL');
  END IF;
END$$;

-- ─── Table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PlanningNotification" (
  "id"                TEXT PRIMARY KEY,
  "employeeId"        TEXT NOT NULL,
  "emailUsed"         TEXT,
  "storeId"           TEXT,
  "periodStart"       DATE NOT NULL,
  "periodEnd"         DATE NOT NULL,
  "sentByUserId"      TEXT NOT NULL,
  "sentAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"            "PlanningNotificationStatus" NOT NULL,
  "shiftCount"        INTEGER NOT NULL DEFAULT 0,
  "totalHours"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "error"             TEXT,
  "providerMessageId" TEXT,
  "shiftSnapshotHash" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Foreign keys (only if not already present) ─────────────────────────
DO $$
BEGIN
  -- employee FK
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlanningNotification_employeeId_fkey'
  ) THEN
    ALTER TABLE "PlanningNotification"
      ADD CONSTRAINT "PlanningNotification_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
  END IF;

  -- store FK (nullable)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlanningNotification_storeId_fkey'
  ) THEN
    ALTER TABLE "PlanningNotification"
      ADD CONSTRAINT "PlanningNotification_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL;
  END IF;

  -- sender (User) FK
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PlanningNotification_sentByUserId_fkey'
  ) THEN
    ALTER TABLE "PlanningNotification"
      ADD CONSTRAINT "PlanningNotification_sentByUserId_fkey"
      FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END$$;

-- ─── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "PlanningNotification_employeeId_sentAt_idx"
  ON "PlanningNotification" ("employeeId", "sentAt");
CREATE INDEX IF NOT EXISTS "PlanningNotification_storeId_periodStart_idx"
  ON "PlanningNotification" ("storeId", "periodStart");
CREATE INDEX IF NOT EXISTS "PlanningNotification_periodStart_periodEnd_idx"
  ON "PlanningNotification" ("periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "PlanningNotification_status_idx"
  ON "PlanningNotification" ("status");
CREATE INDEX IF NOT EXISTS "PlanningNotification_sentByUserId_sentAt_idx"
  ON "PlanningNotification" ("sentByUserId", "sentAt");
