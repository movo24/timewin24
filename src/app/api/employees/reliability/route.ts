import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { recalculateAndSave } from "@/lib/reliability-score";

/**
 * GET /api/employees/reliability
 * Returns reliability scores for all active employees.
 * Filterable by ?storeId=
 */
export async function GET(req: NextRequest) {
  const { error } = await requireManagerOrAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { active: true };

  if (storeId) {
    where.stores = { some: { storeId } };
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
    const body = await req.json().catch(() => ({}));
    const { employeeId } = body as { employeeId?: string };

    if (employeeId) {
      // Single employee
      const breakdown = await recalculateAndSave(employeeId);
      return successResponse({ breakdown });
    }

    // All active employees
    const employees = await prisma.employee.findMany({
      where: { active: true },
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
    console.error("[POST /api/employees/reliability] Error:", err);
    return errorResponse(
      "Erreur serveur: " + (err instanceof Error ? err.message : "inconnue"),
      500
    );
  }
}
