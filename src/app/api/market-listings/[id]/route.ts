import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { checkClaimConstraints } from "@/lib/marketplace";

/**
 * PATCH /api/market-listings/[id]
 * Actions: claim, unclaim, manager_approve, manager_reject, cancel
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const { id } = await params;
    const user = session!.user as { id: string; role: string; employeeId: string | null };

    const body = await req.json();
    const { action, message, response } = body as {
      action?: string;
      message?: string;
      response?: string;
    };

    if (!action) {
      return errorResponse("action est requis (claim, unclaim, manager_approve, manager_reject, cancel)");
    }

    const listing = await prisma.shiftMarketListing.findUnique({ where: { id } });
    if (!listing) return errorResponse("Listing non trouvé", 404);

    // Check expiration for OPEN listings
    if (listing.status === "OPEN" && listing.expiresAt < new Date()) {
      await prisma.shiftMarketListing.update({
        where: { id },
        data: { status: "EXPIRED" },
      });
      return errorResponse("Ce listing a expiré");
    }

    switch (action) {
      case "claim": {
        if (listing.status !== "OPEN") {
          return errorResponse("Ce shift n'est plus disponible");
        }
        if (user.role !== "EMPLOYEE" || !user.employeeId) {
          return errorResponse("Seul un employé peut réclamer un shift");
        }
        if (user.employeeId === listing.posterId) {
          return errorResponse("Vous ne pouvez pas réclamer votre propre shift");
        }

        // Verify employee is assigned to the store
        const storeAssignment = await prisma.storeEmployee.findFirst({
          where: { employeeId: user.employeeId, storeId: listing.storeId },
        });
        if (!storeAssignment) {
          return errorResponse("Vous n'êtes pas assigné à ce magasin");
        }

        // Load shift for constraint checking
        const shift = await prisma.shift.findUnique({ where: { id: listing.shiftId } });
        if (!shift) return errorResponse("Le shift n'existe plus", 404);

        // Run constraint checks
        const checks = await checkClaimConstraints(user.employeeId, {
          id: shift.id,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
        });

        if (!checks.eligible) {
          const reasons: string[] = [];
          if (!checks.overlapOk) reasons.push("conflit de shift");
          if (!checks.weeklyHoursOk) reasons.push(`heures hebdo dépassées (${checks.details.currentWeeklyHours.toFixed(1)}h/${checks.details.maxWeeklyHours}h)`);
          if (!checks.dailyHoursOk) reasons.push(`heures quotidiennes dépassées (${checks.details.currentDailyHours.toFixed(1)}h/${checks.details.maxDailyHours}h)`);
          if (!checks.restOk) reasons.push("repos insuffisant (11h min)");
          if (!checks.availabilityOk) reasons.push("indisponibilité déclarée");
          return errorResponse(`Contraintes non respectées : ${reasons.join(", ")}`);
        }

        // Claim the listing (atomic check that it's still OPEN)
        const updated = await prisma.shiftMarketListing.updateMany({
          where: { id, status: "OPEN" },
          data: {
            status: "CLAIMED",
            claimantId: user.employeeId,
            claimantMessage: message || null,
            constraintChecks: JSON.stringify(checks),
            claimedAt: new Date(),
          },
        });

        if (updated.count === 0) {
          return errorResponse("Ce shift vient d'être réclamé par quelqu'un d'autre");
        }

        return successResponse({ claimed: true });
      }

      case "unclaim": {
        if (listing.status !== "CLAIMED") {
          return errorResponse("Ce listing n'est pas réclamé");
        }
        if (user.employeeId !== listing.claimantId) {
          return errorResponse("Seul le réclamant peut annuler sa réclamation");
        }

        await prisma.shiftMarketListing.update({
          where: { id },
          data: {
            status: "OPEN",
            claimantId: null,
            claimantMessage: null,
            constraintChecks: null,
            claimedAt: null,
          },
        });

        return successResponse({ unclaimed: true });
      }

      case "manager_approve": {
        if (listing.status !== "CLAIMED") {
          return errorResponse("Ce listing n'est pas en attente de validation");
        }
        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
          return errorResponse("Seul un manager ou admin peut valider");
        }
        if (!listing.claimantId) {
          return errorResponse("Aucun réclamant pour ce listing");
        }

        // Re-verify shift exists
        const shift = await prisma.shift.findUnique({ where: { id: listing.shiftId } });
        if (!shift) return errorResponse("Le shift n'existe plus", 404);

        // Re-check constraints at approval time
        const recheck = await checkClaimConstraints(listing.claimantId, {
          id: shift.id,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
        });

        if (!recheck.eligible) {
          return errorResponse(
            "Les contraintes ne sont plus respectées depuis la réclamation. Veuillez rejeter et laisser un autre employé réclamer."
          );
        }

        // Atomic transaction: reassign shift + update listing
        await prisma.$transaction([
          prisma.shift.update({
            where: { id: shift.id },
            data: {
              employeeId: listing.claimantId,
              note: `Marché — transféré de ${listing.posterId}`,
            },
          }),
          prisma.shiftMarketListing.update({
            where: { id },
            data: {
              status: "APPROVED",
              managerId: user.id,
              managerResponse: response || null,
              managerRespondedAt: new Date(),
              constraintChecks: JSON.stringify(recheck),
            },
          }),
        ]);

        console.log(
          `[PATCH /api/market-listings/${id}] Manager approved: shift ${shift.id} transferred to ${listing.claimantId}`
        );
        return successResponse({ approved: true });
      }

      case "manager_reject": {
        if (listing.status !== "CLAIMED") {
          return errorResponse("Ce listing n'est pas en attente de validation");
        }
        if (user.role !== "ADMIN" && user.role !== "MANAGER") {
          return errorResponse("Seul un manager ou admin peut refuser");
        }

        // Reset to OPEN so another employee can claim
        await prisma.shiftMarketListing.update({
          where: { id },
          data: {
            status: "OPEN",
            claimantId: null,
            claimantMessage: null,
            constraintChecks: null,
            claimedAt: null,
            managerId: user.id,
            managerResponse: response || null,
            managerRespondedAt: new Date(),
          },
        });

        return successResponse({ rejected: true });
      }

      case "cancel": {
        if (!["OPEN", "CLAIMED"].includes(listing.status)) {
          return errorResponse("Ce listing ne peut plus être annulé");
        }
        if (user.employeeId !== listing.posterId) {
          return errorResponse("Seul le posteur peut annuler");
        }

        await prisma.shiftMarketListing.update({
          where: { id },
          data: { status: "CANCELLED" },
        });

        return successResponse({ cancelled: true });
      }

      default:
        return errorResponse("Action non reconnue");
    }
  } catch (err) {
    console.error("[PATCH /api/market-listings/[id]] Error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
