import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  requireManagerOrAdmin,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";
import { deleteFile } from "@/lib/uploads";

// DELETE /api/feed/[id] — Supprimer un post (admin ou auteur)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const { id } = await params;
    const user = session!.user as { id: string; role: string };

    const post = await prisma.feedPost.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });

    if (!post) return errorResponse("Post introuvable", 404);

    // Auteur ou admin peut supprimer
    if (post.authorId !== user.id && user.role !== "ADMIN") {
      return errorResponse("Accès refusé", 403);
    }

    // Fetch attachment paths before deleting from DB
    const attachments = await prisma.messageAttachment.findMany({
      where: { entityType: "feed_post", entityId: id },
      select: { path: true },
    });

    // Delete associated attachments from DB
    await prisma.messageAttachment.deleteMany({
      where: { entityType: "feed_post", entityId: id },
    });

    await prisma.feedPost.delete({ where: { id } });

    // Clean up files from disk after successful DB delete
    for (const att of attachments) {
      await deleteFile(att.path);
    }

    return successResponse({ message: "Post supprimé" });
  } catch (err) {
    console.error("DELETE /api/feed/[id] error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
