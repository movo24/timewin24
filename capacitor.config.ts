import type { CapacitorConfig } from '@capacitor/cli';

/**
 * TimeWin24 — Capacitor iOS config
 *
 * Mode "Remote URL" : la WebView native charge directement la prod Vercel
 * (https://app.timewin24.com). On garde toute l'archi Next.js serveur intacte
 * et on ajoute par-dessus une couche native (push, biometric, etc.) pour
 * passer l'Apple review (guideline 4.2).
 */
const config: CapacitorConfig = {
  appId: 'com.timewin24.app',
  appName: 'TimeWin24',
  webDir: 'public', // Fallback statique — non utilisé tant que server.url pointe ailleurs.

  // ─── Mode Remote URL ────────────────────────────────────────────────────
  server: {
    url: 'https://app.timewin24.com',
    cleartext: false, // HTTPS only
    iosScheme: 'https', // Cookies/session NextAuth fonctionnent comme sur web
  },

  ios: {
    // Évite que la WebView affiche un fond blanc avant le premier paint serveur.
    backgroundColor: '#FFFFFF',
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      iosSpinnerStyle: 'small',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DEFAULT', // Texte sombre sur fond clair (ajustable plus tard)
    },
    Keyboard: {
      resize: 'native', // Layout natif géré par iOS quand le clavier apparaît
    },
  },
};

export default config;
