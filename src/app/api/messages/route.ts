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
import { dispatchNotificationAsync } from "@/lib/notifications/dispatcher";

const attachmentSchema = z.object({
  filename: z.string(),
  path: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

const createMessageSchema = z.object({
  subject: z.string().min(1, "Objet requis").max(200),
  body: z.string().min(1, "Message requis").max(5000),
  category: z
    .enum(["GENERAL", "PLANNING", "CONGE", "ABSENCE", "ADMINISTRATIF", "RECLAMATION", "AUTRE"])
    .default("GENERAL"),
  parentId: z.string().optional(), // Pour les réponses
  attachments: z.array(attachmentSchema).optional(), // Fichiers déjà uploadés
});

// GET /api/messages — Liste des messages
// Employé: ses propres messages uniquement
// Admin/Manager: tous les messages avec filtres
export async function GET(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string; role: string; employeeId: string | null };
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const storeId = searchParams.get("storeId");
    const employeeId = searchParams.get("employeeId");
    const category = searchParams.get("category");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20") || 20));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      parentId: null, // Seulement les messages racine (pas les réponses)
    };

    if (user.role === "EMPLOYEE") {
      // Employé ne voit que ses propres messages
      where.senderId = user.id;
    } else {
      // Admin/Manager: filtres
      const VALID_STATUSES = ["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
      const VALID_CATEGORIES = ["GENERAL", "PLANNING", "CONGE", "ABSENCE", "ADMINISTRATIF", "RECLAMATION", "AUTRE"] as const;
      if (status && VALID_STATUSES.includes(status as any)) where.status = status;
      if (storeId) where.storeId = storeId;
      if (employeeId) where.employeeId = employeeId;
      if (category && VALID_CATEGORIES.includes(category as any)) where.category = category;
    }

    const [rawMessages, total] = await Promise.all([
      prisma.hrMessage.findMany({
        where,
        include: {
          sender: {
            select: { id: true, name: true, email: true },
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
          _count: { select: { replies: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.hrMessage.count({ where }),
    ]);

    // Load attachments for all messages + replies
    const allMessageIds = rawMessages.flatMap((m: any) => [
      m.id,
      ...m.replies.map((r: any) => r.id),
    ]);
    const attachments = allMessageIds.length > 0
      ? await prisma.messageAttachment.findMany({
          where: { entityType: "hr_message", entityId: { in: allMessageIds } },
        })
      : [];
    const attachmentMap = new Map<string, typeof attachments>();
    for (const att of attachments) {
      const list = attachmentMap.get(att.entityId) || [];
      list.push(att);
      attachmentMap.set(att.entityId, list);
    }
    const messages = rawMessages.map((m: any) => ({
      ...m,
      attachments: attachmentMap.get(m.id) || [],
      replies: m.replies.map((r: any) => ({
        ...r,
        attachments: attachmentMap.get(r.id) || [],
      })),
    }));

    // Stats pour admin/manager
    let stats = null;
    if (user.role !== "EMPLOYEE") {
      const [newCount, inProgressCount, resolvedCount, closedCount] = await Promise.all([
        prisma.hrMessage.count({ where: { parentId: null, status: "NEW" } }),
        prisma.hrMessage.count({ where: { parentId: null, status: "IN_PROGRESS" } }),
        prisma.hrMessage.count({ where: { parentId: null, status: "RESOLVED" } }),
        prisma.hrMessage.count({ where: { parentId: null, status: "CLOSED" } }),
      ]);
      stats = { new: newCount, inProgress: inProgressCount, resolved: resolvedCount, closed: closedCount };
    }

    return successResponse({
      messages,
      stats,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("GET /api/messages error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

// POST /api/messages — Envoyer un message (employé) ou répondre (admin/manager)
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string; role: string; employeeId: string | null };
    const body = await req.json();
    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
    }

    const { subject, body: messageBody, category, parentId, attachments: fileAttachments } = parsed.data;

    // Si c'est une réponse, vérifier le message parent
    if (parentId) {
      const parent = await prisma.hrMessage.findUnique({
        where: { id: parentId },
        select: { id: true, senderId: true, status: true },
      });
      if (!parent) return errorResponse("Message parent introuvable", 404);

      // Employé ne peut répondre qu'à ses propres threads
      if (user.role === "EMPLOYEE" && parent.senderId !== user.id) {
        return errorResponse("Accès refusé", 403);
      }

      // Créer la réponse
      // employeeId is required (non-nullable) in schema; use "" for admin/manager who have no employee profile
      const reply = await prisma.hrMessage.create({
        data: {
          senderId: user.id,
          employeeId: user.employeeId || "",
          subject,
          body: messageBody,
          category,
          parentId,
          status: "IN_PROGRESS",
        },
      });

      // Si c'est un admin/manager qui répond, prendre en charge + marquer lu
      if (user.role !== "EMPLOYEE") {
        await prisma.hrMessage.update({
          where: { id: parentId },
          data: {
            status: "IN_PROGRESS",
            handlerId: user.id,
            readAt: parent.status === "NEW" ? new Date() : undefined,
          },
        });

        // Notify the employee who sent the original message
        dispatchNotificationAsync({
          userIds: [parent.senderId],
          eventType: "NEW_MESSAGE",
          context: {
            senderName: session!.user.name || "Manager",
            subject,
          },
        });
      } else {
        // Employee replied → notify managers/admins
        const managers = await prisma.user.findMany({
          where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
          select: { id: true },
        });
        if (managers.length > 0) {
          dispatchNotificationAsync({
            userIds: managers.map((m) => m.id),
            eventType: "NEW_MESSAGE",
            context: {
              senderName: session!.user.name || "Employé",
              subject,
            },
          });
        }
      }

      return successResponse(reply, 201);
    }

    // Nouveau message (seulement les employés)
    if (user.role === "EMPLOYEE") {
      if (!user.employeeId) {
        return errorResponse("Aucun profil employé lié à ce compte");
      }

      // Récupérer le magasin principal de l'employé
      const employeeStore = await prisma.storeEmployee.findFirst({
        where: { employeeId: user.employeeId },
        select: { storeId: true },
      });

      const message = await prisma.hrMessage.create({
        data: {
          senderId: user.id,
          employeeId: user.employeeId,
          storeId: employeeStore?.storeId || null,
          subject,
          body: messageBody,
          category,
        },
      });

      // Create attachment records for uploaded files
      if (fileAttachments && fileAttachments.length > 0) {
        await prisma.messageAttachment.createMany({
          data: fileAttachments.map((att) => ({
            filename: att.filename,
            path: att.path,
            mimeType: att.mimeType,
            size: att.size,
            entityType: "hr_message",
            entityId: message.id,
          })),
        });
      }

      await logAudit(user.id, "CREATE", "HrMessage", message.id, {
        subject,
        category,
      });

      // Notify managers/admins about the new message
      const managers = await prisma.user.findMany({
        where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
        select: { id: true },
      });
      if (managers.length > 0) {
        dispatchNotificationAsync({
          userIds: managers.map((m) => m.id),
          eventType: "NEW_MESSAGE",
          context: {
            senderName: session!.user.name || "Employé",
            subject,
          },
        });
      }

      return successResponse(message, 201);
    }

    // Admin/Manager : créer un message vers un employé spécifique
    // Pour l'instant, les admins répondent uniquement via parentId
    const { error: roleError } = await requireManagerOrAdmin();
    if (roleError) return roleError;

    return errorResponse("Les administrateurs répondent aux messages existants via parentId");
  } catch (err) {
    console.error("POST /api/messages error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
