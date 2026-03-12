import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireManagerOrAdmin,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * GET /api/notifications/logs?eventType=&channel=&status=&userId=&limit=50
 * Notification history for admin/manager.
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireManagerOrAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const eventType = searchParams.get("eventType");
    const channel = searchParams.get("channel");
    const status = searchParams.get("status");
    const userId = searchParams.get("userId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const VALID_EVENT_TYPES = ["PLANNING_MODIFIED", "SHIFT_REMINDER", "ABSENCE_REPORTED", "NEW_MESSAGE", "REPLACEMENT_OFFER", "SHIFT_EXCHANGE", "BROADCAST", "ALERT"] as const;
    const VALID_CHANNELS = ["PUSH", "EMAIL", "IN_APP"] as const;
    const VALID_STATUSES = ["PENDING", "SENT", "FAILED"] as const;

    const where: Record<string, unknown> = {};
    if (eventType && eventType !== "ALL" && VALID_EVENT_TYPES.includes(eventType as any)) where.eventType = eventType;
    if (channel && channel !== "ALL" && VALID_CHANNELS.includes(channel as any)) where.channel = channel;
    if (status && status !== "ALL" && VALID_STATUSES.includes(status as any)) where.status = status;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.notificationLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notificationLog.count({ where }),
    ]);

    // Stats
    const stats = await prisma.notificationLog.groupBy({
      by: ["status"],
      _count: true,
    });

    const statsMap = Object.fromEntries(
      stats.map((s) => [s.status, s._count])
    );

    return successResponse({
      logs,
      total,
      stats: {
        sent: statsMap.SENT || 0,
        failed: statsMap.FAILED || 0,
        pending: statsMap.PENDING || 0,
      },
    });
  } catch (err) {
    console.error("GET /api/notifications/logs error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
