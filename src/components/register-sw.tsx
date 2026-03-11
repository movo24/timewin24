"use client";

import { useEffect, useCallback } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

/**
 * Convert VAPID key from base64 URL to Uint8Array for pushManager.subscribe.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe the user to push notifications.
 * Call this after the user grants Notification permission.
 */
export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.warn("VAPID public key not configured");
      return false;
    }

    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Re-send to backend in case it was lost
      await sendSubscriptionToServer(existing);
      return true;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });

    await sendSubscriptionToServer(subscription);
    return true;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Remove from backend
      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error("Push unsubscribe failed:", err);
    return false;
  }
}

/**
 * Check if the user is currently subscribed to push.
 */
export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

async function sendSubscriptionToServer(
  subscription: PushSubscription
): Promise<void> {
  const json = subscription.toJSON();
  await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
}

export function RegisterSW() {
  const register = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch {
        // SW registration failed
      }
    }
  }, []);

  useEffect(() => {
    register();
  }, [register]);

  return null;
}
