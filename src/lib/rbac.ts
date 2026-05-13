/**
 * RBAC — Role-Based Access Control centralisé pour TimeWin
 *
 * Architecture :
 * - Chaque rôle possède une liste explicite de permissions
 * - Les routes et endpoints se protègent par permission
 * - Le middleware utilise la classification des routes
 * - Multi-tenant SaaS : scope par Company + store-scoping
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SaaS App Store — distinction fondamentale entre SUPER_ADMIN et OWNER :
 *
 *   SUPER_ADMIN = scope PLATEFORME (staff TimeWin24, voit TOUTES les companies)
 *   OWNER       = scope COMPANY UNIQUEMENT (propriétaire d'UNE company)
 *   ADMIN       = scope COMPANY UNIQUEMENT (admin d'UNE company)
 *   MANAGER     = scope COMPANY + sites autorisés
 *   EMPLOYEE    = scope SELF uniquement (ses propres données)
 *
 * RÈGLE ABSOLUE : un OWNER ne doit JAMAIS hériter du comportement SUPER_ADMIN
 * (cross-company). Utiliser `isPlatformAdmin()` pour distinguer.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

// ============================================================
// RÔLES
// ============================================================

export type AppRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";

/** Hiérarchie des rôles (plus le nombre est élevé, plus les droits sont élevés) */
export const ROLE_HIERARCHY: Record<AppRole, number> = {
  EMPLOYEE: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4, // au-dessus d'ADMIN mais reste CONFINÉ à une Company
  SUPER_ADMIN: 5, // staff plateforme — accès cross-company
};

/** Labels lisibles pour l'UI */
export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: "Super Admin",
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  MANAGER: "Manager",
  EMPLOYEE: "Employé",
};

/** Vérifie si un rôle est au moins aussi élevé qu'un autre */
export function hasMinimumRole(userRole: string, minimumRole: AppRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as AppRole];
  const requiredLevel = ROLE_HIERARCHY[minimumRole];
  if (userLevel === undefined || requiredLevel === undefined) return false;
  return userLevel >= requiredLevel;
}

/** Vérifie si un rôle est admin ou manager (legacy — n'inclut PAS OWNER) */
export function isAdminOrManager(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "MANAGER";
}

/**
 * LEGACY : vérifie si un rôle est admin "plateforme" au sens historique.
 * Retourne true UNIQUEMENT pour SUPER_ADMIN + ADMIN.
 *
 * ⚠ Ne PAS inclure OWNER dans cette fonction : ses comportements
 *   historiques (ex: `getAccessibleStoreIds` retourne `null` = unrestricted)
 *   donneraient à un OWNER un accès cross-company. INTERDIT en SaaS.
 *   Pour vérifier qu'un user peut administrer SA company → `isCompanyAdmin()`.
 */
export function isAdmin(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/** Vérifie si un rôle est super admin */
export function isSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN";
}

/** Vérifie si un rôle est employé */
export function isEmployee(role: string): boolean {
  return role === "EMPLOYEE";
}

// ════════════════════════════════════════════════════════════════════════════
// SaaS App Store — helpers spécifiques au scope COMPANY vs PLATEFORME
// ════════════════════════════════════════════════════════════════════════════

/**
 * True UNIQUEMENT si le rôle a un scope PLATEFORME (cross-company).
 * Aujourd'hui : SUPER_ADMIN seul.
 *
 * Utiliser ce helper pour les checks qui doivent EXPLICITEMENT permettre
 * l'accès cross-company (ex: support TimeWin24).
 */
export function isPlatformAdmin(role: string): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * True si le rôle peut administrer SA Company.
 * SaaS App Store : OWNER + ADMIN.
 * Inclut aussi SUPER_ADMIN pour le support plateforme.
 *
 * Utiliser ce helper pour les actions admin AU SEIN D'UNE Company
 * (ex: gérer employés, modifier paramètres société).
 */
export function isCompanyAdmin(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";
}

/** True si le rôle est OWNER (propriétaire de la Company). */
export function isOwner(role: string): boolean {
  return role === "OWNER";
}

/**
 * True si le rôle est confiné à UNE Company (ne peut pas voir cross-company).
 * SaaS App Store : OWNER, ADMIN, MANAGER, EMPLOYEE.
 * Faux UNIQUEMENT pour SUPER_ADMIN.
 *
 * Sémantique : "ce user DOIT avoir un companyId pour faire quoi que ce soit".
 */
export function isCompanyScoped(role: string): boolean {
  return role !== "SUPER_ADMIN";
}

// ============================================================
// PERMISSIONS
// ============================================================

export type Permission =
  // Planning
  | "view_own_schedule"
  | "view_team_schedule"
  | "edit_schedule"
  | "generate_planning"
  // Employés
  | "manage_employees"
  | "view_employee_list"
  | "view_employee_reliability"
  // Magasins
  | "manage_stores"
  | "view_stores"
  // Comptes utilisateurs
  | "manage_accounts"
  // Coûts & Analytics
  | "view_costs"
  | "manage_costs"
  | "view_analytics"
  // Absences
  | "create_absence"
  | "manage_absences"
  // Pointages
  | "clock_in"
  | "view_all_clockins"
  // Remplacements & Échanges
  | "create_replacement"
  | "manage_replacements"
  | "create_shift_exchange"
  | "manage_shift_exchanges"
  // Marché de shifts
  | "view_market"
  | "claim_market_listing"
  | "manage_market"
  // Messages
  | "send_message"
  | "manage_messages"
  // Annonces & Fil d'actualité
  | "view_feed"
  | "post_feed"
  | "manage_broadcasts"
  // Notifications
  | "view_notification_logs"
  // Alertes
  | "manage_alerts"
  // Journal
  | "manage_journal"
  // Audit & Intégrations
  | "view_audit"
  | "manage_integrations"
  // Indisponibilités
  | "manage_unavailabilities"
  // AI Engine
  | "use_ai_assistant"
  | "view_ai_metrics"
  | "manage_ai_anomalies"
  | "admin_ai_engine"
  // Organisation / Unités
  | "manage_organizations"
  | "view_organizations"
  | "manage_units"
  | "view_units"
  // Applications connectées
  | "manage_connected_apps"
  | "view_connected_apps"
  // POS Events
  | "view_pos_events";

/** Matrice rôle → permissions */
export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  SUPER_ADMIN: [
    // Tout, y compris multi-org
    "view_own_schedule", "view_team_schedule", "edit_schedule", "generate_planning",
    "manage_employees", "view_employee_list", "view_employee_reliability",
    "manage_stores", "view_stores",
    "manage_accounts",
    "view_costs", "manage_costs", "view_analytics",
    "create_absence", "manage_absences",
    "clock_in", "view_all_clockins",
    "create_replacement", "manage_replacements",
    "create_shift_exchange", "manage_shift_exchanges",
    "view_market", "claim_market_listing", "manage_market",
    "send_message", "manage_messages",
    "view_feed", "post_feed", "manage_broadcasts",
    "view_notification_logs",
    "manage_alerts",
    "manage_journal",
    "view_audit", "manage_integrations",
    "manage_unavailabilities",
    "use_ai_assistant", "view_ai_metrics", "manage_ai_anomalies", "admin_ai_engine",
    "manage_organizations", "view_organizations",
    "manage_units", "view_units",
    "manage_connected_apps", "view_connected_apps",
    "view_pos_events",
  ],
  OWNER: [
    // SaaS — Propriétaire d'une Company. Mêmes permissions qu'ADMIN au sein de
    // sa Company, mais NE PEUT JAMAIS voir une autre Company.
    // L'isolation est garantie par `enforceCompanyScope` côté ORM, pas par RBAC.
    "view_own_schedule", "view_team_schedule", "edit_schedule", "generate_planning",
    "manage_employees", "view_employee_list", "view_employee_reliability",
    "manage_stores", "view_stores",
    "manage_accounts",
    "view_costs", "manage_costs", "view_analytics",
    "create_absence", "manage_absences",
    "clock_in", "view_all_clockins",
    "create_replacement", "manage_replacements",
    "create_shift_exchange", "manage_shift_exchanges",
    "view_market", "claim_market_listing", "manage_market",
    "send_message", "manage_messages",
    "view_feed", "post_feed", "manage_broadcasts",
    "view_notification_logs",
    "manage_alerts",
    "manage_journal",
    "view_audit",
    "manage_unavailabilities",
  ],
  ADMIN: [
    // Tout sauf gestion orgs (scope unité)
    "view_own_schedule", "view_team_schedule", "edit_schedule", "generate_planning",
    "manage_employees", "view_employee_list", "view_employee_reliability",
    "manage_stores", "view_stores",
    "manage_accounts",
    "view_costs", "manage_costs", "view_analytics",
    "create_absence", "manage_absences",
    "clock_in", "view_all_clockins",
    "create_replacement", "manage_replacements",
    "create_shift_exchange", "manage_shift_exchanges",
    "view_market", "claim_market_listing", "manage_market",
    "send_message", "manage_messages",
    "view_feed", "post_feed", "manage_broadcasts",
    "view_notification_logs",
    "manage_alerts",
    "manage_journal",
    "view_audit", "manage_integrations",
    "manage_unavailabilities",
    "use_ai_assistant", "view_ai_metrics", "manage_ai_anomalies", "admin_ai_engine",
    "view_organizations",
    "manage_units", "view_units",
    "manage_connected_apps", "view_connected_apps",
    "view_pos_events",
  ],
  MANAGER: [
    "view_own_schedule", "view_team_schedule", "edit_schedule", "generate_planning",
    "view_employee_list", "view_employee_reliability",
    "view_stores",
    "view_costs", "view_analytics",
    "manage_absences",
    "view_all_clockins",
    "manage_replacements",
    "manage_shift_exchanges",
    "view_market", "manage_market",
    "manage_messages",
    "view_feed", "post_feed", "manage_broadcasts",
    "view_notification_logs",
    "manage_alerts",
    "manage_journal",
    "manage_unavailabilities",
    "use_ai_assistant", "view_ai_metrics", "manage_ai_anomalies",
  ],
  EMPLOYEE: [
    "view_own_schedule",
    "create_absence",
    "clock_in",
    "create_replacement",
    "create_shift_exchange",
    "view_market", "claim_market_listing",
    "send_message",
    "view_feed", "post_feed",
  ],
};

/** Vérifie si un rôle possède une permission */
export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as AppRole];
  if (!perms) return false;
  return perms.includes(permission);
}

/** Vérifie si un rôle possède AU MOINS UNE des permissions */
export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/** Vérifie si un rôle possède TOUTES les permissions */
export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

// ============================================================
// CLASSIFICATION DES ROUTES (pour le middleware)
// ============================================================

/** Routes accessibles uniquement par ADMIN et MANAGER */
export const ADMIN_ROUTES = [
  "/dashboard",
  "/planning",
  "/employees",
  "/stores",
  "/costs",
  "/pointages",
  "/remplacements",
  "/echanges",
  "/alertes",
  "/audit",
  "/accounts",
  "/integrations",
  "/journal",
  "/absences",
  "/notifications",
  "/messages",
  "/organizations",
  "/units",
  "/connected-apps",
  "/pos-events",
  "/etiquettes",
  "/performance",
];

/** Routes accessibles uniquement par EMPLOYEE */
export const EMPLOYEE_ROUTES = [
  "/mon-planning",
  "/mes-absences",
  "/mes-remplacements",
  "/mes-messages",
  "/mes-notifications",
  "/pointage",
  "/marche-shifts",
];

/** Routes accessibles par tous les rôles authentifiés */
export const SHARED_ROUTES = [
  "/fil-actualite",
  "/annonces",
];

/** Toutes les routes protégées */
export const PROTECTED_ROUTES = [...ADMIN_ROUTES, ...EMPLOYEE_ROUTES, ...SHARED_ROUTES];

/** Pages de login */
export const LOGIN_PAGES = ["/login", "/admin-login"];

/** Routes publiques (pas d'auth requise) */
export const PUBLIC_ROUTES = ["/login", "/admin-login", "/api/auth", "/changer-mot-de-passe"];

// ============================================================
// REDIRECTIONS
// ============================================================

/** Route par défaut après login selon le rôle */
export function getDefaultRouteForRole(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/organizations";
    case "OWNER":
    case "ADMIN":
    case "MANAGER":
      return "/dashboard";
    case "EMPLOYEE":
      return "/mon-planning";
    default:
      return "/login";
  }
}

/** Page de login appropriée pour un rôle */
export function getLoginPageForRole(role: string): string {
  return role === "EMPLOYEE" ? "/login" : "/admin-login";
}

/** Page de login basée sur le type de route */
export function getLoginPageForRoute(pathname: string): string {
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  return isAdminRoute ? "/admin-login" : "/login";
}
