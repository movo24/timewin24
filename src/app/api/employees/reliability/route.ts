import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  getAccessibleStoreIds,
  canAccessEmployee,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { resolveNestedStoreFilter } from "@/lib/store-scope";
import { recalculateAndSave } from "@/lib/reliability-score";

/**
 * GET /api/employees/reliability
 * Returns reliability scores for all active employees.
 * Filterable by ?storeId=
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { storeIds, error: scopeErr } = await getAccessibleStoreIds();
    if (scopeErr) return scopeErr;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    const scoped = resolveNestedStoreFilter(storeIds, storeId);
    if (!scoped.ok) return errorResponse("Magasin hors de votre périmètre", 403);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { active: true };

    // Restreint aux magasins accessibles (manager) ; admin = pas de filtre.
    if (scoped.storeIdFilter !== undefined) {
      where.stores = { some: { storeId: scoped.storeIdFilter } };
    }

    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        reliabilityScore: true,
        scoreUpdatedAt: true,
        contractType: true,
        stores: {
          select: { store: { select: { id: true, name: true } } },
        },
      },
      orderBy: { lastName: "asc" },
    });

    return successResponse({ employees });
  } catch (err) {
    logger.error("GET /api/employees/reliability error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

/**
 * POST /api/employees/reliability
 * Recalculate scores.
 * Body: { employeeId?: string } — if provided, recalculate only that employee.
 * If omitted, recalculate all active employees.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireManagerOrAdmin();
  if (error) return error;

  try {
    const { storeIds, error: scopeErr } = await getAccessibleStoreIds();
    if (scopeErr) return scopeErr;

    const body = await req.json().catch(() => ({}));
    const { employeeId } = body as { employeeId?: string };

    if (employeeId) {
      // Single employee — doit être dans le périmètre du manager.
      if (!(await canAccessEmployee(employeeId, storeIds))) {
        return errorResponse("Employé hors de votre périmètre", 403);
      }
      const breakdown = await recalculateAndSave(employeeId);
      return successResponse({ breakdown });
    }

    // Tous les employés actifs — restreints aux magasins accessibles (admin = tous).
    const employees = await prisma.employee.findMany({
      where: {
        active: true,
        ...(storeIds !== null ? { stores: { some: { storeId: { in: storeIds } } } } : {}),
      },
      select: { id: true },
    });

    const results: { employeeId: string; score: number }[] = [];
    for (const emp of employees) {
      const breakdown = await recalculateAndSave(emp.id);
      results.push({ employeeId: emp.id, score: breakdown.score });
    }

    return successResponse({
      recalculated: results.length,
      results,
    });
  } catch (err) {
    logger.error("POST /api/employees/reliability error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
