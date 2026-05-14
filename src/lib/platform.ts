/**
 * Détection de la plateforme runtime (Capacitor iOS / Android / Web).
 *
 * API asynchrone uniquement — l'import de `@capacitor/core` est dynamique
 * pour ne JAMAIS être exécuté lors du SSR / build Next.js (Server Components,
 * Server Actions, etc.). Côté serveur, toutes les fonctions retournent leurs
 * valeurs neutres ("web" / false).
 *
 * Usage typique (Client Component) :
 *   'use client';
 *   import { useEffect, useState } from 'react';
 *   import { getPlatform, type Platform } from '@/lib/platform';
 *
 *   const [platform, setPlatform] = useState<Platform>('web');
 *   useEffect(() => { getPlatform().then(setPlatform); }, []);
 *
 * Ce module n'a PAS de directive 'use client' : il peut donc être importé
 * depuis un Server Component (qui obtiendra toujours 'web'), depuis un
 * Client Component, ou depuis un middleware Edge sans casser le bundle.
 */

export type Platform = "ios" | "android" | "web";

/**
 * Retourne la plateforme runtime.
 * - SSR / serveur Node : 'web'
 * - Safari / Chrome iOS/Android : 'web'
 * - WebView Capacitor iOS : 'ios'
 * - WebView Capacitor Android : 'android'
 */
export async function getPlatform(): Promise<Platform> {
  if (typeof window === "undefined") return "web";
  try {
    const { Capacitor } = await import("@capacitor/core");
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : "web";
  } catch {
    // @capacitor/core absent du bundle (ex: web seul) ou échec de chargement
    // → fallback sûr vers web.
    return "web";
  }
}

/**
 * true si on tourne dans une WebView Capacitor native (iOS ou Android),
 * false sinon (web, SSR).
 */
export async function isNative(): Promise<boolean> {
  return (await getPlatform()) !== "web";
}

/**
 * true uniquement dans Capacitor iOS.
 */
export async function isIOS(): Promise<boolean> {
  return (await getPlatform()) === "ios";
}

/**
 * true uniquement dans Capacitor Android.
 * Pas utilisé en V1 (iOS only) mais ajouté pour future-proof.
 */
export async function isAndroid(): Promise<boolean> {
  return (await getPlatform()) === "android";
}
