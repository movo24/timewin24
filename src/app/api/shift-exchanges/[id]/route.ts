import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * PATCH /api/shift-exchanges/[id]
 * Actions: peer_accept, peer_reject, manager_approve, manager_reject, cancel
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const { id } = await params;
  const user = session.user as { id: string; role: string; employeeId: string | null };

  const body = await req.json();
  const { action, response } = body as {
    action?: string;
    response?: string;
  };

  if (!action) {
    return errorResponse("action est requis (peer_accept, peer_reject, manager_approve, manager_reject, cancel).");
  }

  const exchange = await prisma.shiftExchange.findUnique({
    where: { id },
  });

  if (!exchange) {
    return errorResponse("Échange non trouvé.", 404);
  }

  // Check expiration
  if (exchange.expiresAt && new Date() > exchange.expiresAt) {
    await prisma.shiftExchange.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
    return errorResponse("Cet échange a expiré.");
  }

  switch (action) {
    case "peer_accept": {
      if (exchange.status !== "PENDING_PEER") {
        return errorResponse("Cet échange n'est pas en attente d'acceptation.");
      }
      if (user.employeeId !== exchange.targetId) {
        return errorResponse("Seul l'employé ciblé peut accepter.");
      }

      const updated = await prisma.shiftExchange.update({
        where: { id },
        data: {
          status: "PENDING_MANAGER",
          peerResponse: response || null,
          peerRespondedAt: new Date(),
        },
      });
      return successResponse({ exchange: updated });
    }

    case "peer_reject": {
      if (exchange.status !== "PENDING_PEER") {
        return errorResponse("Cet échange n'est pas en attente d'acceptation.");
      }
      if (user.employeeId !== exchange.targetId) {
        return errorResponse("Seul l'employé ciblé peut refuser.");
      }

      const updated = await prisma.shiftExchange.update({
        where: { id },
        data: {
          status: "REJECTED_PEER",
          peerResponse: response || null,
          peerRespondedAt: new Date(),
        },
      });
      return successResponse({ exchange: updated });
    }

    case "manager_approve": {
      if (exchange.status !== "PENDING_MANAGER") {
        return errorResponse("Cet échange n'est pas en attente de validation manager.");
      }
      if (user.role !== "ADMIN" && user.role !== "MANAGER") {
        return errorResponse("Seul un manager ou admin peut valider.");
      }

      // Perform the actual shift swap
      const requesterShift = await prisma.shift.findUnique({
        where: { id: exchange.requesterShiftId },
      });

      if (!requesterShift) {
        return errorResponse("Le shift de l'initiateur n'existe plus.");
      }

      if (exchange.targetShiftId) {
        // Full swap: exchange both shifts
        const targetShift = await prisma.shift.findUnique({
          where: { id: exchange.targetShiftId },
        });

        if (!targetShift) {
          return errorResponse("Le shift du collègue n'existe plus.");
        }

        // Swap employees on both shifts
        await prisma.$transaction([
          prisma.shift.update({
            where: { id: requesterShift.id },
            data: {
              employeeId: exchange.targetId,
              note: `Échange approuvé — était assigné à ${exchange.requesterId}`,
            },
          }),
          prisma.shift.update({
            where: { id: targetShift.id },
            data: {
              employeeId: exchange.requesterId,
              note: `Échange approuvé — était assigné à ${exchange.targetId}`,
            },
          }),
          prisma.shiftExchange.update({
            where: { id },
            data: {
              status: "APPROVED",
              managerId: user.id,
              managerResponse: response || null,
              managerRespondedAt: new Date(),
            },
          }),
        ]);
      } else {
        // Simple transfer: just reassign the requester's shift to the target
        await prisma.$transaction([
          prisma.shift.update({
            where: { id: requesterShift.id },
            data: {
              employeeId: exchange.targetId,
              note: `Transfert approuvé — était assigné à ${exchange.requesterId}`,
            },
          }),
          prisma.shiftExchange.update({
            where: { id },
            data: {
              status: "APPROVED",
              managerId: user.id,
              managerResponse: response || null,
              managerRespondedAt: new Date(),
            },
          }),
        ]);
      }

      return successResponse({ exchange: { ...exchange, status: "APPROVED" } });
    }

    case "manager_reject": {
      if (exchange.status !== "PENDING_MANAGER") {
        return errorResponse("Cet échange n'est pas en attente de validation manager.");
      }
      if (user.role !== "ADMIN" && user.role !== "MANAGER") {
        return errorResponse("Seul un manager ou admin peut refuser.");
      }

      const updated = await prisma.shiftExchange.update({
        where: { id },
        data: {
          status: "REJECTED_MANAGER",
          managerId: user.id,
          managerResponse: response || null,
          managerRespondedAt: new Date(),
        },
      });
      return successResponse({ exchange: updated });
    }

    case "cancel": {
      if (!["PENDING_PEER", "PENDING_MANAGER"].includes(exchange.status)) {
        return errorResponse("Cet échange ne peut plus être annulé.");
      }
      if (user.employeeId !== exchange.requesterId) {
        return errorResponse("Seul l'initiateur peut annuler.");
      }

      const updated = await prisma.shiftExchange.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      return successResponse({ exchange: updated });
    }

    default:
      return errorResponse("Action non reconnue.");
  }
}
