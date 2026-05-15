"use client";

/**
 * NativeChrome — couche native iOS minimale appliquée au boot.
 *
 * Comportement :
 * - Sur web (Safari/Chrome, SSR) : no-op, render `null`, aucun appel Capacitor.
 * - Sur Capacitor iOS/Android :
 *   - StatusBar.setStyle({ style: Style.Default })  → iOS choisit auto
 *     selon le fond (safe pour pages claires ET sombres).
 *   - Keyboard.setResizeMode({ mode: KeyboardResize.Native }) → iOS resize
 *     nativement le viewport quand le clavier monte.
 *   - App.addListener("appStateChange", ...) → observe foreground/background
 *     pour future logique de reprise (refetch, push refresh, etc.).
 *     V1 : log dev-only, aucun side-effect métier.
 *
 * Tous les plugins Capacitor sont chargés via dynamic import + try/catch
 * silencieux : si un package est absent du bundle ou échoue à charger,
 * l'app continue à fonctionner sans crash.
 *
 * Doit être rendu UNE FOIS au plus haut niveau (RootLayout). Ne retourne
 * aucun DOM — pur side-effect au mount.
 */

import { useEffect } from "react";
import { getPlatform } from "@/lib/platform";

type AppListenerHandle = { remove: () => Promise<void> };

export function NativeChrome(): null {
  useEffect(() => {
    let cancelled = false;
    let appListenerHandle: AppListenerHandle | null = null;

    (async () => {
      const platform = await getPlatform();
      if (cancelled) return;
      if (platform === "web") return; // no-op sur web

      // StatusBar : style automatique iOS — texte clair/sombre selon contenu.
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        if (cancelled) return;
        await StatusBar.setStyle({ style: Style.Default });
      } catch {
        // @capacitor/status-bar indisponible → ignore
      }

      // Keyboard : iOS resize natif quand le clavier apparaît.
      try {
        const { Keyboard, KeyboardResize } = await import(
          "@capacitor/keyboard"
        );
        if (cancelled) return;
        await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
      } catch {
        // @capacitor/keyboard indisponible → ignore
      }

      // App lifecycle : observe foreground/background.
      // V1 : aucun refetch, aucun push, aucune logique métier — juste un
      // socle propre pour la suite. Log uniquement en development.
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        const handle = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (process.env.NODE_ENV === "development") {
              // eslint-disable-next-line no-console
              console.log("[NativeChrome] appStateChange isActive=", isActive);
            }
          },
        );
        if (cancelled) {
          // Composant unmount entre l'await et l'assignation → cleanup direct.
          handle.remove().catch(() => {});
          return;
        }
        appListenerHandle = handle;
      } catch {
        // @capacitor/app indisponible → ignore
      }
    })();

    return () => {
      cancelled = true;
      appListenerHandle?.remove().catch(() => {});
    };
  }, []);

  return null;
}
