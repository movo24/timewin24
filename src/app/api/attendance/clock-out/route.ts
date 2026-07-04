import { logger } from "@/lib/logger";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse, getSessionOrUnauthorized, getAccessibleStoreIds, canAccessEmployee } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/rbac";
import { isStoreAccessible } from "@/lib/store-scope";
import { z } from "zod";

// ─── POST /api/attendance/clock-out ──────────────────
// Enregistre un pointage de départ.
// Ferme le ClockIn ouvert pour cet employé/magasin.

const clockOutSchema = z.object({
  employeeId: z.string().min(1),
  storeId: z.string().min(1),
  source: z.enum(["mobile", "pos", "manual"]).optional().default("manual"),
});

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await getSessionOrUnauthorized();
    if (error) return error;

    const body = await req.json();
    const parsed = clockOutSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { employeeId, storeId } = parsed.data;

    // Anti-spoofing (cf. clock-in) : service-key/admin OK ; sinon périmètre +
    // ownership (on ne dépointe pas pour autrui hors de son périmètre).
    const actor = session!.user as { id: string; role: string; employeeId: string | null };
    if (!actor.id.startsWith("service:") && !isAdmin(actor.role)) {
      const { storeIds } = await getAccessibleStoreIds();
      if (!isStoreAccessible(storeIds, storeId)) {
        return errorResponse("Magasin hors de votre périmètre", 403);
      }
      if (actor.employeeId !== employeeId && !(await canAccessEmployee(employeeId, storeIds))) {
        return errorResponse("Vous ne pouvez pas pointer pour cet employé", 403);
      }
    }

    // Find open clock-in (no clockOutAt)
    const openClockIn = await prisma.clockIn.findFirst({
      where: {
        employeeId,
        storeId,
        clockOutAt: null,
      },
      orderBy: { clockInAt: "desc" },
    });

    if (!openClockIn) {
      return errorResponse("Aucun pointage ouvert trouvé pour cet employé", 404);
    }

    const clockOutAt = new Date();
    const workedMs = clockOutAt.getTime() - openClockIn.clockInAt.getTime();
    const workedHours = Math.round((workedMs / (1000 * 60 * 60)) * 100) / 100;

    const updated = await prisma.clockIn.update({
      where: { id: openClockIn.id },
      data: { clockOutAt },
    });

    return successResponse({
      clock_in_id: updated.id,
      employee_id: employeeId,
      store_id: storeId,
      clock_in_at: updated.clockInAt.toISOString(),
      clock_out_at: clockOutAt.toISOString(),
      worked_hours: workedHours,
      status: updated.status,
      late_minutes: updated.lateMinutes,
    });
  } catch (err) {
    logger.error("POST /api/attendance/clock-out error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
