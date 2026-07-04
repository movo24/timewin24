import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { ensureEstablishment, getEstablishmentByStore } from "@/lib/payroll/repository";

/**
 * GET /api/payroll/establishment?storeId=...
 *
 * Renvoie l'établissement (SIRET, raison sociale, APE) du magasin + ses
 * contrats. Le provisionne (idempotent) s'il n'existe pas encore. Admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const storeId = req.nextUrl.searchParams.get("storeId");
    if (!storeId) return errorResponse("storeId requis", 400);

    let establishment = await getEstablishmentByStore(storeId);
    if (!establishment) {
      await ensureEstablishment(storeId); // provisioning idempotent
      establishment = await getEstablishmentByStore(storeId);
    }
    if (!establishment) return errorResponse("Magasin introuvable", 404);

    return successResponse({ establishment });
  } catch (e) {
    logger.error("[PAYROLL][establishment][GET] error", e);
    return errorResponse("Erreur lors du chargement de l'établissement", 500);
  }
}
