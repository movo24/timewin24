import { NextRequest } from "next/server";
import { requireAuthenticated, errorResponse, successResponse } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { saveFile, ALLOWED_TYPES, MAX_FILE_SIZE } from "@/lib/uploads";

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entityType = formData.get("entityType") as string | null;
    const entityId = formData.get("entityId") as string | null;

    if (!file) {
      return errorResponse("Aucun fichier fourni");
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse(
        `Type de fichier non autorisé. Types acceptés : JPEG, PNG, WebP, MP4, MOV`
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse("Fichier trop volumineux (max 50 MB)");
    }

    // Validate entityType
    const VALID_ENTITY_TYPES = ["hr_message", "feed_post", "absence_declaration", "journal_entry"];
    if (entityType && !VALID_ENTITY_TYPES.includes(entityType)) {
      return errorResponse("Type d'entité invalide");
    }

    const saved = await saveFile(file);

    // If entityType/entityId provided, create the attachment record immediately
    if (entityType && entityId) {
      // Ownership check: verify the user owns the entity they're attaching to
      const user = session.user as { id: string; role: string; employeeId: string | null };
      if (entityType === "hr_message") {
        const msg = await prisma.hrMessage.findUnique({ where: { id: entityId } });
        if (!msg) return errorResponse("Entité introuvable", 404);
        if (user.role === "EMPLOYEE" && msg.senderId !== user.id) {
          return errorResponse("Accès non autorisé", 403);
        }
      } else if (entityType === "absence_declaration") {
        const abs = await prisma.absenceDeclaration.findUnique({ where: { id: entityId } });
        if (!abs) return errorResponse("Entité introuvable", 404);
        if (user.role === "EMPLOYEE" && abs.employeeId !== user.employeeId) {
          return errorResponse("Accès non autorisé", 403);
        }
      } else if (entityType === "feed_post") {
        const post = await prisma.feedPost.findUnique({ where: { id: entityId } });
        if (!post) return errorResponse("Entité introuvable", 404);
        if (user.role === "EMPLOYEE" && post.authorId !== user.id) {
          return errorResponse("Accès non autorisé", 403);
        }
      } else if (entityType === "journal_entry") {
        const entry = await prisma.journalEntry.findUnique({ where: { id: entityId } });
        if (!entry) return errorResponse("Entité introuvable", 404);
        // Only managers/admins can attach to journal entries
        if (user.role === "EMPLOYEE") {
          return errorResponse("Accès non autorisé", 403);
        }
      }

      const attachment = await prisma.messageAttachment.create({
        data: {
          filename: saved.filename,
          path: saved.storedPath,
          mimeType: saved.mimeType,
          size: saved.size,
          entityType,
          entityId,
        },
      });
      return successResponse({ attachment });
    }

    // Otherwise return file info for later association
    return successResponse({
      filename: saved.filename,
      path: saved.storedPath,
      mimeType: saved.mimeType,
      size: saved.size,
    });
  } catch (err) {
    console.error("POST /api/uploads error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
