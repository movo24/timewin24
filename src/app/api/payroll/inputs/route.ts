import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";

/**
 * GET /api/payroll/inputs?storeId=...&period=YYYY-MM
 *
 * Liste les variables de paie PERSISTÉES (quantités) d'un magasin × période,
 * jointes au contrat → salarié. Lecture admin. Aucune valorisation.
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const storeId = req.nextUrl.searchParams.get("storeId");
    const period = req.nextUrl.searchParams.get("period");
    if (!storeId) return errorResponse("storeId requis", 400);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse("period requis au format YYYY-MM", 400);
    }

    const inputs = await prisma.payrollInput.findMany({
      where: { period, contract: { establishment: { storeId } } },
      select: {
        id: true,
        period: true,
        status: true,
        totalWorkedHours: true,
        normalHours: true,
        overtimeHours: true,
        complementaryHours: true,
        sundayHours: true,
        holidayHours: true,
        paidLeaveDays: true,
        sickOrAccidentDays: true,
        otherAbsenceDays: true,
        latenessMinutes: true,
        validatedAt: true,
        lockedAt: true,
        updatedAt: true,
        contract: {
          select: {
            id: true,
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { contract: { employee: { lastName: "asc" } } },
    });

    const rows = inputs.map((i) => {
      const { contract, ...rest } = i;
      return {
        ...rest,
        contractId: contract.id,
        employeeId: contract.employee.id,
        employeeName: `${contract.employee.firstName} ${contract.employee.lastName}`,
      };
    });

    return successResponse({ storeId, period, count: rows.length, rows });
  } catch (e) {
    logger.error("[PAYROLL][inputs] error", e);
    return errorResponse("Erreur lors du chargement des variables persistées", 500);
  }
}
