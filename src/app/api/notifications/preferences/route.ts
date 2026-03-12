import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotificationEventType } from "@/generated/prisma/client";
import {
  requireAuthenticated,
  successResponse,
  errorResponse,
} from "@/lib/api-helpers";
import { EVENT_CONFIG } from "@/lib/notifications/events";

const ALL_EVENT_TYPES = Object.keys(EVENT_CONFIG) as NotificationEventType[];

/**
 * GET /api/notifications/preferences
 * Get notification preferences for the current user.
 * Returns defaults merged with saved preferences.
 */
export async function GET() {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string };

    const saved = await prisma.notificationPreference.findMany({
      where: { userId: user.id },
    });

    const savedMap = new Map(saved.map((p) => [p.eventType, p]));

    const preferences = ALL_EVENT_TYPES.map((eventType) => {
      const config = EVENT_CONFIG[eventType];
      const pref = savedMap.get(eventType);

      return {
        eventType,
        label: config.titleTemplate,
        priority: config.defaultPriority,
        push: pref ? pref.push : config.defaultChannels.push,
        email: pref ? pref.email : config.defaultChannels.email,
        sms: pref ? pref.sms : config.defaultChannels.sms,
      };
    });

    // Also get user phone for SMS config
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });

    return successResponse({ preferences, phone: userData?.phone || null });
  } catch (err) {
    console.error("GET /api/notifications/preferences error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}

/**
 * PUT /api/notifications/preferences
 * Update a notification preference for the current user.
 */
export async function PUT(req: NextRequest) {
  try {
    const { session, error } = await requireAuthenticated();
    if (error) return error;

    const user = session!.user as { id: string };
    const body = await req.json();
    const { eventType, push, email, sms, phone } = body as {
      eventType?: string;
      push?: boolean;
      email?: boolean;
      sms?: boolean;
      phone?: string;
    };

    // Update phone number if provided
    if (phone !== undefined) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phone: phone || null },
      });
    }

    // Update event preference if provided
    if (eventType) {
      if (!ALL_EVENT_TYPES.includes(eventType as NotificationEventType)) {
        return errorResponse("Type d'événement invalide");
      }

      await prisma.notificationPreference.upsert({
        where: {
          userId_eventType: {
            userId: user.id,
            eventType: eventType as NotificationEventType,
          },
        },
        create: {
          userId: user.id,
          eventType: eventType as NotificationEventType,
          push: push ?? true,
          email: email ?? true,
          sms: sms ?? false,
        },
        update: {
          ...(push !== undefined && { push }),
          ...(email !== undefined && { email }),
          ...(sms !== undefined && { sms }),
        },
      });
    }

    return successResponse({ updated: true });
  } catch (err) {
    console.error("PUT /api/notifications/preferences error:", err);
    return errorResponse(
      "Erreur serveur",
      500
    );
  }
}
