import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";
import { z } from "zod";

const createPostSchema = z.object({
  content: z.string().min(1, "Message requis").max(5000),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        path: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })
    )
    .optional(),
});

// GET /api/feed — Liste des posts (paginé par cursor)
export async function GET(req: NextRequest) {
  const { error } = await requireAuthenticated();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const posts = await prisma.feedPost.findMany({
    take: limit + 1, // +1 pour savoir s'il y a une page suivante
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
      _count: { select: { comments: true } },
    },
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  // Load attachments for all posts
  const postIds = items.map((p) => p.id);
  const attachments =
    postIds.length > 0
      ? await prisma.messageAttachment.findMany({
          where: { entityType: "feed_post", entityId: { in: postIds } },
        })
      : [];

  const attachmentMap = new Map<string, typeof attachments>();
  for (const att of attachments) {
    const list = attachmentMap.get(att.entityId) || [];
    list.push(att);
    attachmentMap.set(att.entityId, list);
  }

  const enriched = items.map((post) => ({
    ...post,
    attachments: attachmentMap.get(post.id) || [],
  }));

  return successResponse({ posts: enriched, nextCursor });
}

// POST /api/feed — Créer un post
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const body = await req.json();
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const user = session!.user as { id: string };

  const post = await prisma.feedPost.create({
    data: {
      authorId: user.id,
      content: parsed.data.content,
    },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
      _count: { select: { comments: true } },
    },
  });

  // Create attachment records
  if (parsed.data.attachments && parsed.data.attachments.length > 0) {
    await prisma.messageAttachment.createMany({
      data: parsed.data.attachments.map((att) => ({
        filename: att.filename,
        path: att.path,
        mimeType: att.mimeType,
        size: att.size,
        entityType: "feed_post",
        entityId: post.id,
      })),
    });
  }

  return successResponse(post, 201);
}
