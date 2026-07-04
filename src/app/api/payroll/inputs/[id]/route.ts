import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { requireAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { changePayrollInputStatus } from "@/lib/payroll/repository";
import type { PayrollInputStatus } from "@/lib/payroll/persistence";

const ALLOWED: PayrollInputStatus[] = ["draft", "validated", "locked"];

/**
 * PATCH /api/payroll/inputs/[id]  { status: "draft" | "validated" | "locked" }
 *
 * Change le statut d'une ligne PayrollInput sous garde de transition :
 * draft → validated → locked (et validated → draft pour réouverture).
 * `locked` est un verrou mensuel non destructif (terminal côté application).
 * Réservé ADMIN/SUPER_ADMIN. Audit sans donnée sensible.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const to = body.status as PayrollInputStatus | undefined;

    if (!to || !ALLOWED.includes(to)) {
      return errorResponse(`status requis parmi : ${ALLOWED.join(", ")}`, 400);
    }

    const result = await changePayrollInputStatus(id, to);
    if (!result.ok) {
      if (result.reason === "not_found") return errorResponse("Ligne introuvable", 404);
      return errorResponse(`Transition invalide depuis « ${result.status} » vers « ${to} »`, 409);
    }

    const actorId = (session!.user as { id?: string }).id ?? "unknown";
    logger.info(`[PAYROLL][status] actor=${actorId} input=${id} -> ${result.status}`);
    await logAudit(actorId, "UPDATE", "PayrollInput", id, { status: result.status });

    return successResponse({ id, status: result.status });
  } catch (e) {
    logger.error("[PAYROLL][status] error", e);
    return errorResponse("Erreur lors du changement de statut", 500);
  }
}
