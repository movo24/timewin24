import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { updateEstablishment } from "@/lib/payroll/repository";
import { isValidSiret, normalizeDigits } from "@/lib/payroll/siret";

/**
 * PATCH /api/payroll/establishment/[id]
 *   { siret?, legalName?, apeCode? }
 *
 * Met à jour les métadonnées administratives de l'établissement. Le SIRET, s'il
 * est fourni et non vide, doit être valide (14 chiffres + clé de Luhn). Admin
 * only. Aucune valorisation : identifiants administratifs uniquement.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const data: { siret?: string | null; legalName?: string | null; apeCode?: string | null } = {};

    if (body.siret !== undefined) {
      const raw = body.siret === null ? "" : String(body.siret).trim();
      if (raw === "") {
        data.siret = null;
      } else if (!isValidSiret(raw)) {
        return errorResponse("SIRET invalide (14 chiffres + clé de Luhn attendus)", 400);
      } else {
        data.siret = normalizeDigits(raw);
      }
    }
    if (body.legalName !== undefined) data.legalName = body.legalName ? String(body.legalName).trim() : null;
    if (body.apeCode !== undefined) data.apeCode = body.apeCode ? String(body.apeCode).trim() : null;

    if (Object.keys(data).length === 0) return errorResponse("Aucun champ à mettre à jour", 400);

    const updated = await updateEstablishment(id, data);

    const actorId = (session!.user as { id?: string }).id ?? "unknown";
    logger.info(`[PAYROLL][establishment][PATCH] actor=${actorId} establishment=${id} fields=${Object.keys(data).join(",")}`);

    return successResponse({ establishment: updated });
  } catch (e) {
    // Conflit d'unicité SIRET (déjà utilisé par un autre établissement)
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return errorResponse("Ce SIRET est déjà rattaché à un autre établissement", 409);
    }
    logger.error("[PAYROLL][establishment][PATCH] error", e);
    return errorResponse("Erreur lors de la mise à jour de l'établissement", 500);
  }
}
