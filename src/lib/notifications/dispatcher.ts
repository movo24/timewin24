import { prisma } from "@/lib/prisma";
import {
  NotificationEventType,
  NotificationPriority,
  NotificationChannel,
} from "@/generated/prisma/client";
import { EVENT_CONFIG } from "./events";
import { sendPushToUser } from "./push";
import { sendEmail, isEmailConfigured } from "./email";
import { sendSMS, isSmsConfigured } from "./sms";

interface DispatchParams {
  userIds: string[];
  eventType: NotificationEventType;
  context: Record<string, string>;
  priorityOverride?: NotificationPriority;
}

interface DispatchResult {
  sent: number;
  failed: number;
}

/**
 * Central notification dispatcher.
 * Determines channels based on priority + user preferences, sends via all active channels,
 * and logs everything to NotificationLog.
 */
export async function dispatchNotification(
  params: DispatchParams
): Promise<DispatchResult> {
  const { userIds, eventType, context, priorityOverride } = params;
  const config = EVENT_CONFIG[eventType];
  if (!config) return { sent: 0, failed: 0 };

  const priority = priorityOverride || config.defaultPriority;
  const title = config.titleTemplate;
  const body = config.bodyTemplate(context);
  const url = config.urlBuilder(context);

  let totalSent = 0;
  let totalFailed = 0;

  // Load users with their preferences and email
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, active: true },
    select: {
      id: true,
      email: true,
      phone: true,
      notificationPreferences: {
        where: { eventType },
      },
    },
  });

  for (const user of users) {
    const pref = user.notificationPreferences[0];
    const channels = resolveChannels(priority, config.defaultChannels, pref);

    for (const channel of channels) {
      const result = await sendViaChannel(channel, user, {
        title,
        body,
        url,
        priority,
      });

      // Log the notification
      await prisma.notificationLog
        .create({
          data: {
            userId: user.id,
            eventType,
            channel,
            priority,
            status: result.success ? "SENT" : "FAILED",
            title,
            body,
            url,
            error: result.error || null,
            sentAt: result.success ? new Date() : null,
          },
        })
        .catch((err) => {
          console.error("Failed to log notification:", err);
        });

      if (result.success) totalSent++;
      else totalFailed++;
    }
  }

  return { sent: totalSent, failed: totalFailed };
}

/**
 * Determine which channels to use based on priority, defaults, and user preferences.
 */
function resolveChannels(
  priority: NotificationPriority,
  defaults: { push: boolean; email: boolean; sms: boolean },
  pref?: { push: boolean; email: boolean; sms: boolean } | null
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];

  // User preferences override defaults, but CRITICAL always sends push + email
  const wantsPush = pref ? pref.push : defaults.push;
  const wantsEmail = pref ? pref.email : defaults.email;
  const wantsSms = pref ? pref.sms : defaults.sms;

  // Push
  if (wantsPush || priority === "CRITICAL") {
    channels.push("PUSH");
  }

  // Email — for NORMAL+ or if user opted in
  if (priority === "CRITICAL" || priority === "IMPORTANT") {
    if (isEmailConfigured()) channels.push("EMAIL");
  } else if (wantsEmail && isEmailConfigured()) {
    if (priority !== "LOW") channels.push("EMAIL");
  }

  // SMS — only for CRITICAL or user opt-in on IMPORTANT+
  if (priority === "CRITICAL" && isSmsConfigured()) {
    channels.push("SMS");
  } else if (
    priority === "IMPORTANT" &&
    wantsSms &&
    isSmsConfigured()
  ) {
    channels.push("SMS");
  }

  return channels;
}

async function sendViaChannel(
  channel: NotificationChannel,
  user: { id: string; email: string; phone: string | null },
  payload: { title: string; body: string; url: string; priority: string }
): Promise<{ success: boolean; error?: string }> {
  switch (channel) {
    case "PUSH": {
      const result = await sendPushToUser(user.id, {
        title: payload.title,
        body: payload.body,
        url: payload.url,
        priority: payload.priority,
      });
      return {
        success: result.sent > 0,
        error: result.sent === 0 && result.failed > 0 ? "Push failed" : undefined,
      };
    }

    case "EMAIL": {
      if (!user.email) return { success: false, error: "Pas d'email" };
      return sendEmail({
        to: user.email,
        subject: `TimeWin — ${payload.title}`,
        title: payload.title,
        body: payload.body,
        url: payload.url,
      });
    }

    case "SMS": {
      if (!user.phone) return { success: false, error: "Pas de téléphone" };
      return sendSMS(
        user.phone,
        `[TimeWin] ${payload.title}\n${payload.body}`
      );
    }

    default:
      return { success: false, error: `Canal inconnu: ${channel}` };
  }
}

/**
 * Fire-and-forget wrapper — dispatches without blocking the caller.
 */
export function dispatchNotificationAsync(params: DispatchParams): void {
  dispatchNotification(params).catch((err) => {
    console.error("Notification dispatch error:", err);
  });
}
