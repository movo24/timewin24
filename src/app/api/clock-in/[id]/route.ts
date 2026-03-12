import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee, successResponse, errorResponse } from "@/lib/api-helpers";

/**
 * PATCH /api/clock-in/[id] — Pointer son départ (clock-out)
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { employeeId, error } = await requireEmployee();
    if (error) return error;

    const { id } = await params;

    const clockIn = await prisma.clockIn.findUnique({ where: { id } });
    if (!clockIn) return errorResponse("Pointage non trouvé", 404);
    if (clockIn.employeeId !== employeeId) {
      return errorResponse("Ce pointage ne vous appartient pas", 403);
    }
    if (clockIn.clockOutAt) {
      return errorResponse("Vous avez déjà pointé votre départ");
    }

    const updated = await prisma.clockIn.update({
      where: { id },
      data: { clockOutAt: new Date() },
      include: {
        store: { select: { id: true, name: true } },
        shift: { select: { id: true, startTime: true, endTime: true } },
      },
    });

    return successResponse(updated);
  } catch (err) {
    console.error("PATCH /api/clock-in/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
