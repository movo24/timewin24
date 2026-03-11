import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";
import { z } from "zod";

const createCommentSchema = z.object({
  content: z.string().min(1, "Commentaire requis").max(2000),
});

// GET /api/feed/[id]/comments
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuthenticated();
  if (error) return error;

  const { id } = await params;

  const comments = await prisma.feedComment.findMany({
    where: { postId: id },
    orderBy: { createdAt: "asc" },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  return successResponse({ comments });
}

// POST /api/feed/[id]/comments
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const { id } = await params;
  const user = session!.user as { id: string };

  // Verify post exists
  const post = await prisma.feedPost.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!post) return errorResponse("Post introuvable", 404);

  const body = await req.json();
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const comment = await prisma.feedComment.create({
    data: {
      postId: id,
      authorId: user.id,
      content: parsed.data.content,
    },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  return successResponse(comment, 201);
}
