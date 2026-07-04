import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";

/**
 * POST /api/labels/templates/[id]/default
 *
 * Définit ce modèle d'étiquette comme modèle par défaut (unique). Bascule les
 * autres à `isDefault=false` dans la même transaction. Restaure l'endpoint
 * appelé par `components/labels/template-manager.tsx` (M3).
 * Les modèles d'étiquettes sont globaux (pas de dimension magasin) → réservé
 * ADMIN/MANAGER.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;

    const template = await prisma.labelTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!template) return errorResponse("Modèle introuvable", 404);

    await prisma.$transaction([
      prisma.labelTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.labelTemplate.update({ where: { id }, data: { isDefault: true } }),
    ]);

    return successResponse({ id, isDefault: true });
  } catch (err) {
    logger.error("POST /api/labels/templates/[id]/default error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
