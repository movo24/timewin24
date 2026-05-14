/**
 * Feature flags pour TimeWin24 — SaaS App Store / White-Label.
 *
 * Lues une seule fois au démarrage de l'app, depuis les variables d'env.
 * Permet de masquer / désactiver des modules pour la variante SaaS sans
 * supprimer le code (le code reste sur la branche pour la version interne).
 *
 * Convention :
 *   - ENABLE_<MODULE>=true  → module visible/accessible
 *   - ENABLE_<MODULE>=false → module caché (UI) + routes API renvoient 404
 *   - Si non défini → valeur par défaut (voir DEFAULTS ci-dessous)
 *
 * Variant :
 *   TIMEWIN_VARIANT=appstore → preset App Store SaaS (POS/AI/etc OFF)
 *   TIMEWIN_VARIANT=fullstack → preset historique (tout activé)
 *   (sinon "fullstack" par défaut pour ne pas casser la prod)
 */

export type Variant = "appstore" | "fullstack";

export const VARIANT: Variant =
  (process.env.TIMEWIN_VARIANT as Variant) === "appstore"
    ? "appstore"
    : "fullstack";

/**
 * Valeurs par défaut selon la variante.
 * Toute valeur peut être overrided individuellement par une env var ENABLE_*.
 */
const DEFAULTS: Record<Variant, Record<string, boolean>> = {
  appstore: {
    pos: false,
    inventory: false,
    products: false,
    labels: false,
    integrations: false,
    ai: false,
    costs: false,
    performance: false,
    broadcast: false,
    marketplace: false,
    journal: false,
    // Cœur SaaS App Store
    planning: true,
    employees: true,
    stores: true,
    shifts: true,
    clockIn: true,
    absences: true,
    unavailabilities: true,
    messages: true,
    notifications: true,
    accounts: true,
    autoPlan: true,
    notify: true,
    onboarding: true,
    accountDeletion: true,
  },
  fullstack: {
    // Tout activé — comportement historique (variante interne timewin24.fr)
    pos: true,
    inventory: true,
    products: true,
    labels: true,
    integrations: true,
    ai: true,
    costs: true,
    performance: true,
    broadcast: true,
    marketplace: true,
    journal: true,
    planning: true,
    employees: true,
    stores: true,
    shifts: true,
    clockIn: true,
    absences: true,
    unavailabilities: true,
    messages: true,
    notifications: true,
    accounts: true,
    autoPlan: true,
    notify: true,
    onboarding: false, // pas exposé en mode legacy
    accountDeletion: false, // pas exposé en mode legacy
  },
};

/**
 * Lit une feature flag depuis l'env, avec fallback sur DEFAULTS[VARIANT].
 *
 * Patterns env :
 *   ENABLE_POS=true / false
 *   ENABLE_POS=1 / 0
 *   ENABLE_POS=yes / no
 */
function readFlag(key: string, envName: string): boolean {
  const raw = process.env[envName];
  if (raw !== undefined) {
    const normalized = raw.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return DEFAULTS[VARIANT][key] ?? false;
}

/**
 * Objet immutable contenant toutes les feature flags actuelles.
 * À importer dans les routes/composants :
 *   import { FLAGS } from "@/lib/feature-flags";
 *   if (!FLAGS.pos) return notFound();
 */
export const FLAGS = Object.freeze({
  // Modules à exclure du SaaS App Store
  pos: readFlag("pos", "ENABLE_POS"),
  inventory: readFlag("inventory", "ENABLE_INVENTORY"),
  products: readFlag("products", "ENABLE_PRODUCTS"),
  labels: readFlag("labels", "ENABLE_LABELS"),
  integrations: readFlag("integrations", "ENABLE_INTEGRATIONS"),
  ai: readFlag("ai", "ENABLE_AI"),
  costs: readFlag("costs", "ENABLE_COSTS"),
  performance: readFlag("performance", "ENABLE_PERFORMANCE"),
  broadcast: readFlag("broadcast", "ENABLE_BROADCAST"),
  marketplace: readFlag("marketplace", "ENABLE_MARKETPLACE"),
  journal: readFlag("journal", "ENABLE_JOURNAL"),

  // Cœur SaaS
  planning: readFlag("planning", "ENABLE_PLANNING"),
  employees: readFlag("employees", "ENABLE_EMPLOYEES"),
  stores: readFlag("stores", "ENABLE_STORES"),
  shifts: readFlag("shifts", "ENABLE_SHIFTS"),
  clockIn: readFlag("clockIn", "ENABLE_CLOCK_IN"),
  absences: readFlag("absences", "ENABLE_ABSENCES"),
  unavailabilities: readFlag("unavailabilities", "ENABLE_UNAVAILABILITIES"),
  messages: readFlag("messages", "ENABLE_MESSAGES"),
  notifications: readFlag("notifications", "ENABLE_NOTIFICATIONS"),
  accounts: readFlag("accounts", "ENABLE_ACCOUNTS"),
  autoPlan: readFlag("autoPlan", "ENABLE_AUTO_PLAN"),
  notify: readFlag("notify", "ENABLE_NOTIFY"),

  // SaaS App Store specifics
  onboarding: readFlag("onboarding", "ENABLE_ONBOARDING"),
  accountDeletion: readFlag("accountDeletion", "ENABLE_ACCOUNT_DELETION"),

  // Variant string (utile pour debug + UI conditionnelle)
  variant: VARIANT,
} as const);

/**
 * Type-safe key of FLAGS (sans le champ variant).
 */
export type FeatureFlag = Exclude<keyof typeof FLAGS, "variant">;

/**
 * Helper : `requireFlag("pos")` → throw si désactivé.
 * À utiliser au top d'une route API pour bloquer l'accès en mode SaaS.
 *
 * Usage :
 *   import { requireFlag } from "@/lib/feature-flags";
 *   export async function GET(req: NextRequest) {
 *     const off = requireFlag("pos");
 *     if (off) return off;
 *     // ... reste de la route
 *   }
 */
export function requireFlag(flag: FeatureFlag): Response | null {
  if (FLAGS[flag]) return null;
  return new Response(JSON.stringify({ error: "Feature not available" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/** True si un module est activé. Convenience helper pour le code UI. */
export function isFlagEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag] === true;
}
