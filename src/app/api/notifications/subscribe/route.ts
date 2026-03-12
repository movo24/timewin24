import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";

/**
 * POST /api/notifications/subscribe
 * Register a push subscription for the current user.
 */
export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const body = await req.json();
    const { endpoint, keys, userAgent } = body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string;
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return errorResponse("Subscription incomplète (endpoint, p256dh, auth requis)");
    }

    // Validate endpoint is a valid HTTPS URL
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      return errorResponse("URL endpoint invalide");
    }

    const user = session!.user as { id: string };

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
      },
    });

    return successResponse({ id: subscription.id });
  } catch (err) {
    console.error("POST /api/notifications/subscribe error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 * Remove a push subscription.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const body = await req.json();
    const { endpoint } = body as { endpoint?: string };

    if (!endpoint) {
      return errorResponse("Endpoint requis");
    }

    const user = session!.user as { id: string };

    // Only delete subscriptions owned by the current user
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint, userId: user.id } })
      .catch(() => {});

    return successResponse({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/notifications/subscribe error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
