import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  requireManagerOrAdmin,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";

// DELETE /api/feed/[id] — Supprimer un post (admin ou auteur)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Delete associated attachments from DB (files remain on disk)
  await prisma.messageAttachment.deleteMany({
    where: { entityType: "feed_post", entityId: id },
  });

  await prisma.feedPost.delete({ where: { id } });

  return successResponse({ message: "Post supprimé" });
}
