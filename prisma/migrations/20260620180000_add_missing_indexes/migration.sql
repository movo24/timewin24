-- M122 — index manquants (perf) sur colonnes fréquemment filtrées.
-- S'applique via `prisma migrate deploy` ou via `prisma db push`.

CREATE INDEX "PosTimeClock_shiftId_idx" ON "PosTimeClock"("shiftId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "ReplacementOffer_absentEmployeeId_idx" ON "ReplacementOffer"("absentEmployeeId");
