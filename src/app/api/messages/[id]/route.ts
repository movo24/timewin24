import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  requireManagerOrAdmin,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateStatusSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
});

// GET /api/messages/[id] — Détails d'un message avec ses réponses
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const { id } = await params;
    const user = session!.user as { id: string; role: string };

    const message = await prisma.hrMessage.findUnique({
      where: { id },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true },
        },
        handler: {
          select: { id: true, name: true },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!message) return errorResponse("Message introuvable", 404);

    // Employé ne peut voir que ses propres messages
    if (user.role === "EMPLOYEE" && message.senderId !== user.id) {
      return errorResponse("Accès refusé", 403);
    }

    // Si admin ouvre un message NEW, marquer comme lu
    if (user.role !== "EMPLOYEE" && message.status === "NEW" && !message.readAt) {
      await prisma.hrMessage.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }

    // Load attachments for message + replies
    const allIds = [message.id, ...message.replies.map((r) => r.id)];
    const attachments = await prisma.messageAttachment.findMany({
      where: { entityType: "hr_message", entityId: { in: allIds } },
    });
    const attachmentMap = new Map<string, typeof attachments>();
    for (const att of attachments) {
      const list = attachmentMap.get(att.entityId) || [];
      list.push(att);
      attachmentMap.set(att.entityId, list);
    }

    const enriched = {
      ...message,
      attachments: attachmentMap.get(message.id) || [],
      replies: message.replies.map((r) => ({
        ...r,
        attachments: attachmentMap.get(r.id) || [],
      })),
    };

    return successResponse(enriched);
  } catch (err) {
    console.error("GET /api/messages/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// PUT /api/messages/[id] — Changer le statut (admin/manager uniquement)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await req.json();
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const message = await prisma.hrMessage.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!message) return errorResponse("Message introuvable", 404);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      status: parsed.data.status,
      handler: { connect: { id: session!.user.id } },
    };

    if (parsed.data.status === "RESOLVED" || parsed.data.status === "CLOSED") {
      updateData.resolvedAt = new Date();
    }
    if (message.status === "NEW") {
      updateData.readAt = new Date();
    }

    await prisma.hrMessage.update({
      where: { id },
      data: updateData,
    });

    await logAudit(session!.user.id, "UPDATE", "HrMessage", id, {
      oldStatus: message.status,
      newStatus: parsed.data.status,
    });

    return successResponse({ message: "Statut mis à jour" });
  } catch (err) {
    console.error("PUT /api/messages/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
