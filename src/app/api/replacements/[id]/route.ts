import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireEmployee,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { findOverlappingShift } from "@/lib/shifts";

// PATCH /api/replacements/[id] — Employee accepts or declines a replacement offer
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { employeeId, error } = await requireEmployee();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const { action } = body as { action?: string };

    if (!action || !["accept", "decline"].includes(action)) {
      return errorResponse("Action invalide (accept ou decline attendu)");
    }

    // Find the candidate record
    const candidate = await prisma.replacementCandidate.findFirst({
      where: { offerId: id, employeeId: employeeId! },
      include: {
        offer: {
          include: { shift: true },
        },
      },
    });

    if (!candidate) {
      return errorResponse("Offre de remplacement non trouvée", 404);
    }

    if (candidate.status !== "PENDING") {
      return errorResponse("Vous avez déjà répondu à cette offre");
    }

    if (candidate.offer.status !== "OPEN") {
      return errorResponse("Cette offre n'est plus disponible");
    }

    // Check expiration
    if (new Date() > candidate.offer.expiresAt) {
      await prisma.replacementOffer.update({
        where: { id },
        data: { status: "EXPIRED" },
      });
      await prisma.replacementCandidate.updateMany({
        where: { offerId: id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      return errorResponse("Cette offre a expiré");
    }

    if (action === "decline") {
      await prisma.replacementCandidate.update({
        where: { id: candidate.id },
        data: { status: "DECLINED", respondedAt: new Date() },
      });

      // Check if all candidates have responded (declined/expired)
      const pendingCount = await prisma.replacementCandidate.count({
        where: { offerId: id, status: "PENDING" },
      });

      if (pendingCount === 0) {
        // Nobody left — mark offer as expired
        await prisma.replacementOffer.update({
          where: { id },
          data: { status: "EXPIRED" },
        });
        console.log(
          `[PATCH /api/replacements/${id}] All candidates declined — offer EXPIRED`
        );
      }

      return successResponse({ status: "declined" });
    }

    // action === "accept"
    const shift = candidate.offer.shift;

    // Re-validate: check for overlapping shifts (could have changed since offer creation)
    const dateStr = shift.date.toISOString().split("T")[0];
    const overlap = await findOverlappingShift(
      employeeId!,
      dateStr,
      shift.startTime,
      shift.endTime
    );

    if (overlap) {
      return errorResponse(
        "Vous avez un conflit d'horaire avec un autre shift. Impossible d'accepter."
      );
    }

    // Atomic transaction: assign shift + update offer + update candidates
    await prisma.$transaction([
      // Assign shift to this employee
      prisma.shift.update({
        where: { id: shift.id },
        data: {
          employeeId: employeeId!,
          note: `Remplacement — était assigné à l'employé absent`,
        },
      }),
      // Mark this candidate as accepted
      prisma.replacementCandidate.update({
        where: { id: candidate.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      // Mark offer as filled
      prisma.replacementOffer.update({
        where: { id },
        data: {
          status: "FILLED",
          filledByEmployeeId: employeeId!,
        },
      }),
      // Expire all other pending candidates
      prisma.replacementCandidate.updateMany({
        where: {
          offerId: id,
          status: "PENDING",
          id: { not: candidate.id },
        },
        data: { status: "EXPIRED" },
      }),
    ]);

    console.log(
      `[PATCH /api/replacements/${id}] ACCEPTED by employee ${employeeId} — shift ${shift.id} reassigned`
    );

    return successResponse({ status: "accepted", shiftId: shift.id });
  } catch (err) {
    console.error("[PATCH /api/replacements] Error:", err);
    return errorResponse(
      "Erreur serveur: " + (err instanceof Error ? err.message : "inconnue"),
      500
    );
  }
}
