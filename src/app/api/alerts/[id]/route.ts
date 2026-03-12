import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * PATCH /api/alerts/[id]
 * Update alert status: ACKNOWLEDGED, RESOLVED, or DISMISSED.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const { status } = body as { status?: string };

    const validStatuses = ["ACKNOWLEDGED", "RESOLVED", "DISMISSED"];
    if (!status || !validStatuses.includes(status)) {
      return errorResponse(
        "Statut invalide. Valeurs acceptées : " + validStatuses.join(", ")
      );
    }

    const existing = await prisma.managerAlert.findUnique({ where: { id } });
    if (!existing) return errorResponse("Alerte non trouvée", 404);

    const user = session!.user as { id: string };
    const now = new Date();

    const updateData: Record<string, unknown> = { status };
    if (status === "ACKNOWLEDGED") {
      updateData.acknowledgedBy = user.id;
      updateData.acknowledgedAt = now;
    } else if (status === "RESOLVED") {
      updateData.resolvedBy = user.id;
      updateData.resolvedAt = now;
    }

    const updated = await prisma.managerAlert.update({
      where: { id },
      data: updateData,
    });

    return successResponse(updated);
  } catch (err) {
    console.error("PATCH /api/alerts/[id] error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
