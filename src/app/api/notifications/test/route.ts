import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

/**
 * POST /api/notifications/test
 * Send a test notification to the current user.
 */
export async function POST() {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string; name: string };

    const result = await dispatchNotification({
      userIds: [user.id],
      eventType: "BROADCAST",
      context: {
        title: `Notification test pour ${user.name}`,
      },
      priorityOverride: "NORMAL",
    });

    return successResponse({
      message: "Notification test envoyée",
      ...result,
    });
  } catch (err) {
    console.error("POST /api/notifications/test error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
