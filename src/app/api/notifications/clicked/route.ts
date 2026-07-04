import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/notifications/clicked
 * Called from service worker when a notification is clicked.
 * Public endpoint (no auth — SW cannot send cookies).
 */
export async function POST(req: NextRequest) {
  try {
    // M121: endpoint public (SW sans cookie) — limiter l'abus d'écriture clickedAt.
    const ip = getClientIp(req);
    const rl = checkRateLimit(`notif-clicked:${ip}`, RATE_LIMITS.api);
    if (!rl.allowed) return errorResponse("Trop de requêtes", 429);

    const body = await req.json();
    const { notificationId } = body as { notificationId?: string };

    if (!notificationId || typeof notificationId !== "string" || notificationId.length > 200) {
      return successResponse({ ok: true }); // Silently accept
    }

    // Try to find a log entry matching the tag
    // Tags are formatted as "timewin-{logId}" or "timewin-{timestamp}"
    const logId = notificationId.replace("timewin-", "");

    await prisma.notificationLog
      .update({
        where: { id: logId },
        data: { clickedAt: new Date() },
      })
      .catch(() => {
        // Log entry not found — ignore silently
      });

    return successResponse({ ok: true });
  } catch {
    return errorResponse("Erreur", 500);
  }
}
