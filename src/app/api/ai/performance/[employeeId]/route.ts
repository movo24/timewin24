import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// GET /api/ai/performance/[employeeId] — Métriques IA d'un employé
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const { session, error } = await requirePermission("view_ai_metrics");
    if (error) return error;

    const { employeeId } = await params;

    const metrics = await prisma.employeeAiMetrics.findUnique({
      where: { employeeId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            reliabilityScore: true,
            profileCategory: true,
            weeklyHours: true,
            contractType: true,
            skills: true,
          },
        },
      },
    });

    if (!metrics) {
      return errorResponse(
        "Métriques non trouvées pour cet employé. Lancez un calcul POST /api/ai/performance",
        404
      );
    }

    return successResponse(metrics);
  } catch (err) {
    console.error("[GET /api/ai/performance/:id] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
