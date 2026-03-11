"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "timewin_install_dismissed_at";
const DISMISS_DAYS = 14;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as { standalone?: boolean }).standalone === true)
  );
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const checkDismiss = useCallback(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const daysSince =
        (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return true;
    }
    return false;
  }, []);

  useEffect(() => {
    // Already in standalone mode — no need to show
    if (isStandalone()) return;

    // Check dismiss cooldown
    if (checkDismiss()) return;

    // iOS: show custom instructions
    if (isIOS()) {
      const timer = setTimeout(() => {
        setShowIOSGuide(true);
        setVisible(true);
      }, 10000); // 10s delay
      return () => clearTimeout(timer);
    }

    // Android/Desktop: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setVisible(true), 8000); // 8s delay
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [checkDismiss]);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
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
      <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md animate-in slide-in-from-bottom">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Download className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                Installez TimeWin
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Appuyez sur <Share className="inline h-3 w-3" /> en bas de
                Safari, puis{" "}
                <strong>&quot;Sur l&apos;écran d&apos;accueil&quot;</strong> pour
                une expérience optimale.
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
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md animate-in slide-in-from-bottom">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <Download className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              Installer TimeWin
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Ajoutez l&apos;app sur votre écran d&apos;accueil pour un accès
              rapide.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Installer
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
