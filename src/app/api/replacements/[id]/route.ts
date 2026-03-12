import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireEmployee,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

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

    // Atomic transaction: overlap check + assign shift + update offer + update candidates
    try {
      await prisma.$transaction(async (tx) => {
        // Re-validate: check for overlapping shifts inside transaction (using tx, not global prisma)
        const dateStr = shift.date.toISOString().split("T")[0];
        const overlap = await tx.shift.findFirst({
          where: {
            employeeId: employeeId!,
            date: new Date(dateStr),
            id: { not: shift.id },
            OR: [
              { startTime: { lt: shift.endTime }, endTime: { gt: shift.startTime } },
            ],
          },
        });

        if (overlap) {
          throw new Error("OVERLAP_CONFLICT");
        }

        // Assign shift to this employee
        await tx.shift.update({
          where: { id: shift.id },
          data: {
            employeeId: employeeId!,
            note: `Remplacement — était assigné à l'employé absent`,
          },
        });
        // Mark this candidate as accepted
        await tx.replacementCandidate.update({
          where: { id: candidate.id },
          data: { status: "ACCEPTED", respondedAt: new Date() },
        });
        // Mark offer as filled
        await tx.replacementOffer.update({
          where: { id },
          data: {
            status: "FILLED",
            filledByEmployeeId: employeeId!,
          },
        });
        // Expire all other pending candidates
        await tx.replacementCandidate.updateMany({
          where: {
            offerId: id,
            status: "PENDING",
            id: { not: candidate.id },
          },
          data: { status: "EXPIRED" },
        });
      });
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === "OVERLAP_CONFLICT") {
        return errorResponse(
          "Vous avez un conflit d'horaire avec un autre shift. Impossible d'accepter."
        );
      }
      throw txErr;
    }

    console.log(
      `[PATCH /api/replacements/${id}] ACCEPTED by employee ${employeeId} — shift ${shift.id} reassigned`
    );

    return successResponse({ status: "accepted", shiftId: shift.id });
  } catch (err) {
    console.error("[PATCH /api/replacements] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
