import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee, successResponse, errorResponse } from "@/lib/api-helpers";
import { buildPayrollPreview } from "@/lib/payroll/service";
import type { PayrollKey } from "@/lib/payroll/types";

/**
 * GET /api/payroll/me?period=YYYY-MM
 *
 * SELF-SERVICE salarié : un employé consulte SES PROPRES quantités d'heures
 * qualifiées (Étage 2) pour un mois, calculées à la volée depuis ses pointages
 * et absences validés — tous magasins confondus. Tier-1 :
 *  - lecture seule, aucune écriture, aucune persistance ;
 *  - QUANTITÉS uniquement (heures, jours, minutes), aucun euro ;
 *  - strictement limité au salarié connecté (droit d'accès RGPD à ses données).
 */
export async function GET(req: NextRequest) {
  try {
    const { session, employeeId, error } = await requireEmployee();
    if (error) return error;

    const period = req.nextUrl.searchParams.get("period") ?? defaultPeriod();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse("period requis au format YYYY-MM", 400);
    }

    const [year, month] = period.split("-").map(Number);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0)); // dernier jour du mois

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId! },
      select: { id: true, weeklyHours: true },
    });
    if (!employee) return errorResponse("Profil employé introuvable", 404);

    // Pointages du salarié sur la période (tous magasins confondus).
    const clockIns = await prisma.clockIn.findMany({
      where: { employeeId: employeeId!, clockInAt: { gte: periodStart, lt: nextMonth } },
      select: { clockInAt: true, clockOutAt: true, status: true, lateMinutes: true },
    });

    // Absences APPROUVÉES chevauchant la période, bornées au mois.
    const clamp = (d: Date, lo: Date, hi: Date) => (d < lo ? lo : d > hi ? hi : d);
    const absences = (
      await prisma.absenceDeclaration.findMany({
        where: {
          employeeId: employeeId!,
          status: "APPROVED",
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        select: { type: true, startDate: true, endDate: true, status: true },
      })
    ).map((a) => ({
      type: a.type as string,
      status: a.status,
      startDate: clamp(a.startDate, periodStart, periodEnd),
      endDate: clamp(a.endDate, periodStart, periodEnd),
    }));

    const key: PayrollKey = {
      companySiren: null,
      establishmentSiret: null,
      contractId: employeeId!,
      period,
    };
    const preview = buildPayrollPreview({
      key,
      contractWeeklyHours: employee.weeklyHours ?? 35,
      clockIns,
      absences,
    });

    // Audit consultation — sans donnée sensible en clair.
    const actorId = (session!.user as { id?: string }).id ?? "unknown";
    logger.info(`[PAYROLL][me] actor=${actorId} employee=${employeeId} period=${period}`);

    return successResponse({ period, variables: preview.variables });
  } catch (e) {
    logger.error("[PAYROLL][me] error", e);
    return errorResponse("Erreur lors du calcul de vos heures", 500);
  }
}

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
