import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

// PATCH /api/ai/anomaly/[id] — Confirmer/rejeter anomalie
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requirePermission("manage_ai_anomalies");
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const { status, reviewNote } = body as {
      status: "CONFIRMED" | "REJECTED" | "RESOLVED";
      reviewNote?: string;
    };

    if (!status || !["CONFIRMED", "REJECTED", "RESOLVED"].includes(status)) {
      return errorResponse(
        "Statut invalide (CONFIRMED, REJECTED ou RESOLVED attendu)"
      );
    }

    const anomaly = await prisma.aiAnomaly.findUnique({ where: { id } });
    if (!anomaly) {
      return errorResponse("Anomalie non trouvée", 404);
    }

    const user = session!.user as { id: string };

    const updated = await prisma.aiAnomaly.update({
      where: { id },
      data: {
        status,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        reviewNote: reviewNote || null,
      },
    });

    return successResponse(updated);
  } catch (err) {
    logger.error("[PATCH /api/ai/anomaly/:id] Error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
