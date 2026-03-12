import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { recalculateAndSave } from "@/lib/reliability-score";

/**
 * GET /api/employees/reliability/[id]
 * Returns the score history for a specific employee + current breakdown.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;

    // Verify employee exists
    const employee = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        reliabilityScore: true,
        scoreUpdatedAt: true,
      },
    });

    if (!employee) {
      return errorResponse("Employé non trouvé", 404);
    }

    // Get current breakdown (recalculate)
    const breakdown = await recalculateAndSave(id);

    // Get history (last 12 entries)
    const history = await prisma.reliabilityScoreHistory.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    // Parse metrics JSON
    const historyWithMetrics = history.map((h) => ({
      ...h,
      metrics: h.metrics ? JSON.parse(h.metrics) : null,
    }));

    return successResponse({
      employee,
      breakdown,
      history: historyWithMetrics,
    });
  } catch (err) {
    console.error("GET /api/employees/reliability/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
