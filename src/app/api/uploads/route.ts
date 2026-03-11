import { NextRequest } from "next/server";
import { requireAuthenticated, errorResponse, successResponse } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { saveFile, ALLOWED_TYPES, MAX_FILE_SIZE } from "@/lib/uploads";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  try {
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

    const saved = await saveFile(file);

    // If entityType/entityId provided, create the attachment record immediately
    if (entityType && entityId) {
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
    console.error("Upload error:", err);
    return errorResponse("Erreur lors de l'upload", 500);
  }
}
