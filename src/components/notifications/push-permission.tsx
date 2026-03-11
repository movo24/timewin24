"use client";

import { useState, useEffect } from "react";
import { Bell, X, Share } from "lucide-react";
import { subscribeToPush, isPushSubscribed } from "@/components/register-sw";

const DISMISS_KEY = "timewin_push_dismissed_at";
const DISMISS_DAYS = 7;

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export function PushPermission() {
  const [visible, setVisible] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Don't show if no push support
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

      // Don't show if already subscribed
      const subscribed = await isPushSubscribed();
      if (subscribed) return;

      // Don't show if permission already denied
      if (Notification.permission === "denied") return;

      // Don't show if already granted (just subscribe silently)
      if (Notification.permission === "granted") {
        subscribeToPush();
        return;
      }

      // Check dismiss cooldown
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const daysSince =
          (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
        if (daysSince < DISMISS_DAYS) return;
      }

      // iOS Safari: need PWA installed first for push to work
      if (isIOS() && !isStandalone()) {
        setShowIOSGuide(true);
        setVisible(true);
        return;
      }

      setVisible(true);
    }, 5000); // 5 second delay

    return () => clearTimeout(timer);
  }, []);

  const handleActivate = async () => {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await subscribeToPush();
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  if (showIOSGuide) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Share className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Installez TimeWin
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Pour recevoir les notifications, ajoutez TimeWin à votre écran
                d&apos;accueil : appuyez sur{" "}
                <Share className="inline h-3 w-3" /> puis{" "}
                <strong>&quot;Sur l&apos;écran d&apos;accueil&quot;</strong>.
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <Bell className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              Activez les notifications
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Recevez les alertes planning, messages et urgences en temps réel.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleActivate}
                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Activer
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Plus tard
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
