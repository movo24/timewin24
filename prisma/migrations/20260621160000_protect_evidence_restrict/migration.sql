-- M111 — Protège les preuves RH/légales : les cascades destructrices deviennent RESTRICT.
-- Supprimer un Store/Employee ne doit plus détruire Shift / ClockIn / AbsenceDeclaration /
-- EmployeeCost (historique de travail, pointages, absences, coûts). RESTRICT => la
-- suppression échoue tant qu'il existe un historique => on désactive au lieu de supprimer.
-- (Shift.employee reste SetNull : le shift survit en non-assigné, pas de perte de preuve.)
-- S'applique via `prisma migrate deploy` ou `prisma db push`.

-- Shift -> Store
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_storeId_fkey";
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EmployeeCost -> Employee
ALTER TABLE "EmployeeCost" DROP CONSTRAINT "EmployeeCost_employeeId_fkey";
ALTER TABLE "EmployeeCost" ADD CONSTRAINT "EmployeeCost_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AbsenceDeclaration -> Employee
ALTER TABLE "AbsenceDeclaration" DROP CONSTRAINT "AbsenceDeclaration_employeeId_fkey";
ALTER TABLE "AbsenceDeclaration" ADD CONSTRAINT "AbsenceDeclaration_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ClockIn -> Employee
ALTER TABLE "ClockIn" DROP CONSTRAINT "ClockIn_employeeId_fkey";
ALTER TABLE "ClockIn" ADD CONSTRAINT "ClockIn_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ClockIn -> Store
ALTER TABLE "ClockIn" DROP CONSTRAINT "ClockIn_storeId_fkey";
ALTER TABLE "ClockIn" ADD CONSTRAINT "ClockIn_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
