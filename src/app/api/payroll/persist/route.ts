import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import {
  ensureEstablishment,
  ensureContract,
  persistPayrollInputForContract,
} from "@/lib/payroll/repository";

/**
 * POST /api/payroll/persist  { storeId, period: "YYYY-MM" }
 *
 * Calcule et PERSISTE en `draft` les variables de paie (quantités) d'un
 * magasin × période. Étage 2, Tier-2 (écriture) :
 *  - provisioning idempotent Establishment ⟵ Store, Contract ⟵ Employé ;
 *  - upsert PayrollInput par (contrat × période) — anti-doublon par clé unique ;
 *  - une ligne déjà validated/locked n'est PAS réécrite ;
 *  - réservé ADMIN/SUPER_ADMIN ; aucune valorisation, aucun euro.
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const storeId: string | undefined = body.storeId;
    const period: string | undefined = body.period;

    if (!storeId) return errorResponse("storeId requis", 400);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse("period requis au format YYYY-MM", 400);
    }

    const [year, month] = period.split("-").map(Number);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0));

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) return errorResponse("Magasin introuvable", 404);

    // Provisioning établissement (idempotent).
    const establishment = await ensureEstablishment(storeId);

    // Pointages du magasin sur la période.
    const clockIns = await prisma.clockIn.findMany({
      where: { storeId, clockInAt: { gte: periodStart, lt: nextMonth } },
      select: { employeeId: true, clockInAt: true, clockOutAt: true, status: true, lateMinutes: true },
    });
    const employeeIds = [...new Set(clockIns.map((c) => c.employeeId))];
    if (employeeIds.length === 0) {
      return successResponse({ storeId, period, establishmentId: establishment.id, written: 0, skipped: 0, results: [] });
    }

    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, weeklyHours: true },
    });
    const weeklyHoursById = new Map(employees.map((e) => [e.id, e.weeklyHours ?? 35]));

    const absences = await prisma.absenceDeclaration.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: "APPROVED",
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      select: { employeeId: true, type: true, startDate: true, endDate: true, status: true },
    });
    const clamp = (d: Date, lo: Date, hi: Date) => (d < lo ? lo : d > hi ? hi : d);

    let written = 0;
    let skipped = 0;
    const results: Array<{ employeeId: string; contractId: string; status: string; written: boolean }> = [];

    for (const empId of employeeIds) {
      const contract = await ensureContract(empId, establishment.id);
      const empClockIns = clockIns.filter((c) => c.employeeId === empId);
      const empAbsences = absences
        .filter((a) => a.employeeId === empId)
        .map((a) => ({
          type: a.type as string,
          status: a.status,
          startDate: clamp(a.startDate, periodStart, periodEnd),
          endDate: clamp(a.endDate, periodStart, periodEnd),
        }));

      const res = await persistPayrollInputForContract({
        contractId: contract.id,
        period,
        contractWeeklyHours: weeklyHoursById.get(empId) ?? 35,
        clockIns: empClockIns,
        absences: empAbsences,
      });
      if (res.written) written++;
      else skipped++;
      results.push({ employeeId: empId, contractId: contract.id, status: res.status, written: res.written });
    }

    const actorId = (session!.user as { id?: string }).id ?? "unknown";
    logger.info(
      `[PAYROLL][persist] actor=${actorId} store=${storeId} period=${period} written=${written} skipped=${skipped}`
    );

    return successResponse({ storeId, period, establishmentId: establishment.id, written, skipped, results });
  } catch (e) {
    logger.error("[PAYROLL][persist] error", e);
    return errorResponse("Erreur lors de l'enregistrement des variables de paie", 500);
  }
}
