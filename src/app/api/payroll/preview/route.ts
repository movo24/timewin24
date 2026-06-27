import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { buildPayrollPreview } from "@/lib/payroll/service";
import { toCsv, exportChecksum } from "@/lib/payroll/export";
import type { PayrollKey } from "@/lib/payroll/types";

/**
 * GET /api/payroll/preview?storeId=...&period=YYYY-MM[&format=csv]
 *
 * APERÇU EN LECTURE SEULE des variables de paie (Étage 2) calculées à la volée
 * depuis les pointages/absences EXISTANTS. Tier-1 :
 *  - aucune écriture, aucune persistance, aucune nouvelle table ;
 *  - aucune valorisation en euros (uniquement des quantités qualifiées) ;
 *  - réservé ADMIN/SUPER_ADMIN (donnée sensible, moindre privilège).
 *
 * Limites assumées (avant migration Tier-2) : « contrat » ≈ employé (pas encore
 * d'entité EmploymentContract) ; SIRET établissement = null (pas encore d'entité
 * Establishment). SIREN société dérivé de Store → Unit → Organization.
 */
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const storeId = req.nextUrl.searchParams.get("storeId");
    const period = req.nextUrl.searchParams.get("period");
    const format = req.nextUrl.searchParams.get("format") ?? "json";

    if (!storeId) return errorResponse("storeId requis", 400);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) return errorResponse("period requis au format YYYY-MM", 400);

    const [year, month] = period.split("-").map(Number);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0)); // dernier jour du mois

    // Société (SIREN) via Store → Unit → Organization
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, unit: { select: { organization: { select: { siren: true } } } } },
    });
    if (!store) return errorResponse("Magasin introuvable", 404);
    const companySiren = store.unit?.organization?.siren ?? null;

    // Pointages du magasin sur la période
    const clockIns = await prisma.clockIn.findMany({
      where: { storeId, clockInAt: { gte: periodStart, lt: nextMonth } },
      select: { employeeId: true, clockInAt: true, clockOutAt: true, status: true, lateMinutes: true },
    });

    const employeeIds = [...new Set(clockIns.map((c) => c.employeeId))];
    if (employeeIds.length === 0) {
      return successResponse({ storeId, period, companySiren, rows: [] });
    }

    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, weeklyHours: true },
    });
    const weeklyHoursById = new Map(employees.map((e) => [e.id, e.weeklyHours ?? 35]));

    // Absences APPROUVÉES chevauchant la période, pour ces employés
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

    const previews = employeeIds.map((empId) => {
      const empClockIns = clockIns.filter((c) => c.employeeId === empId);
      const empAbsences = absences
        .filter((a) => a.employeeId === empId)
        .map((a) => ({
          type: a.type as string,
          status: a.status,
          startDate: clamp(a.startDate, periodStart, periodEnd),
          endDate: clamp(a.endDate, periodStart, periodEnd),
        }));
      const key: PayrollKey = {
        companySiren,
        establishmentSiret: null, // entité Establishment = migration Tier-2
        contractId: empId, // contrat ≈ employé avant EmploymentContract (Tier-2)
        period,
      };
      return buildPayrollPreview({
        key,
        contractWeeklyHours: weeklyHoursById.get(empId) ?? 35,
        clockIns: empClockIns,
        absences: empAbsences,
      });
    });

    // Audit consultation — sans donnée sensible en clair (ni noms ni heures)
    const actorId = (session!.user as { id?: string }).id ?? "unknown";
    logger.info(
      `[PAYROLL][preview] actor=${actorId} store=${storeId} period=${period} contracts=${previews.length} format=${format}`
    );

    if (format === "csv") {
      const csv = toCsv(previews.map((p) => p.exportRow));
      await logAudit(actorId, "EXPORT", "PayrollInput", `${storeId}:${period}`, { format: "csv", contracts: previews.length });
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="payroll-${storeId}-${period}.csv"`,
          "X-Export-Checksum": exportChecksum(csv),
        },
      });
    }

    return successResponse({
      storeId,
      period,
      companySiren,
      rows: previews.map((p) => ({ contractId: p.key.contractId, variables: p.variables })),
    });
  } catch (e) {
    logger.error("[PAYROLL][preview] error", e);
    return errorResponse("Erreur lors du calcul de l'aperçu paie", 500);
  }
}
