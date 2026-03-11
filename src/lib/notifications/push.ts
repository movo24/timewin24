import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@timewin.fr";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
  return true;
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  priority?: string;
}

/**
 * Send push notification to a specific user (all their subscriptions).
 * Returns { sent, failed } counts.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) {
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    url: payload.url || "/planning",
    tag: payload.tag || `timewin-${Date.now()}`,
    priority: payload.priority || "NORMAL",
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload,
        { TTL: 86400 } // 24 hours
      );
      sent++;
    } catch (err: unknown) {
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : 0;

      // 410 Gone or 404 = subscription expired, remove it
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription
          .delete({ where: { id: sub.id } })
          .catch(() => {});
      }
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Check if VAPID keys are configured.
 */
export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}
