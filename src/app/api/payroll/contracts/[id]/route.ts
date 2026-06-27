import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { updateContract } from "@/lib/payroll/repository";
import { validateContractPatch } from "@/lib/payroll/contract";
import type { ContractType } from "@/generated/prisma/client";

/**
 * PATCH /api/payroll/contracts/[id]
 *   { contractType?, weeklyHours?, startDate?, endDate? }
 *
 * Met à jour un contrat de travail (type, base horaire hebdomadaire, dates).
 * Validation pure préalable. Admin only. Aucune valorisation : la base horaire
 * est une quantité contractuelle.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const checked = validateContractPatch(body);
    if (!checked.ok) return errorResponse(checked.error, 400);
    if (Object.keys(checked.value).length === 0) return errorResponse("Aucun champ à mettre à jour", 400);

    const v = checked.value;
    const data: { contractType?: ContractType; weeklyHours?: number; startDate?: Date; endDate?: Date | null } = {};
    if (v.contractType !== undefined) data.contractType = v.contractType as ContractType;
    if (v.weeklyHours !== undefined) data.weeklyHours = v.weeklyHours;
    if (v.startDate !== undefined) data.startDate = new Date(v.startDate + "T00:00:00Z");
    if (v.endDate !== undefined) data.endDate = v.endDate ? new Date(v.endDate + "T00:00:00Z") : null;

    const updated = await updateContract(id, data);

    const actorId = (session!.user as { id?: string }).id ?? "unknown";
    logger.info(`[PAYROLL][contract][PATCH] actor=${actorId} contract=${id} fields=${Object.keys(data).join(",")}`);
    await logAudit(actorId, "UPDATE", "EmploymentContract", id, { fields: Object.keys(data) });

    return successResponse({ contract: updated });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2025") {
      return errorResponse("Contrat introuvable", 404);
    }
    logger.error("[PAYROLL][contract][PATCH] error", e);
    return errorResponse("Erreur lors de la mise à jour du contrat", 500);
  }
}
