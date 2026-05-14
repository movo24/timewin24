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
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;
    const user = session!.user as { id: string; role: string; companyId: string | null };

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { active: true };

    // SaaS multi-tenant scope
    if (user.role !== "SUPER_ADMIN" && user.companyId) {
      where.companyId = user.companyId;
    }

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
  } catch (err) {
    console.error("GET /api/employees/reliability error:", err);
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
  const { session, error } = await requireManagerOrAdmin();
  if (error) return error;
  const user = session!.user as { id: string; role: string; companyId: string | null };

  try {
    const body = await req.json().catch(() => ({}));
    const { employeeId } = body as { employeeId?: string };

    if (employeeId) {
      // SaaS multi-tenant: cross-company verification
      if (user.role !== "SUPER_ADMIN" && user.companyId) {
        const emp = await prisma.employee.findUnique({
          where: { id: employeeId },
          select: { companyId: true },
        });
        if (emp?.companyId && emp.companyId !== user.companyId) {
          return errorResponse("Accès refusé : employé hors de votre Company", 403);
        }
      }
      const breakdown = await recalculateAndSave(employeeId);
      return successResponse({ breakdown });
    }

    // All active employees — SaaS multi-tenant scoped
    const employees = await prisma.employee.findMany({
      where: {
        active: true,
        ...(user.role !== "SUPER_ADMIN" && user.companyId
          ? { companyId: user.companyId }
          : {}),
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
    console.error("POST /api/employees/reliability error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
