/**
 * RBAC — Role-Based Access Control centralisé pour TimeWin
 *
 * Architecture :
 * - Chaque rôle possède une liste explicite de permissions
 * - Les routes et endpoints se protègent par permission
 * - Le middleware utilise la classification des routes
 * - Prêt pour multi-magasin (store-scoping)
 */

// ============================================================
// RÔLES
// ============================================================

export type AppRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

/** Hiérarchie des rôles (plus le nombre est élevé, plus les droits sont élevés) */
export const ROLE_HIERARCHY: Record<AppRole, number> = {
  EMPLOYEE: 1,
  MANAGER: 2,
  ADMIN: 3,
};

/** Labels lisibles pour l'UI */
export const ROLE_LABELS: Record<AppRole, string> = {
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

/** Vérifie si un rôle est admin ou manager */
export function isAdminOrManager(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

/** Vérifie si un rôle est admin */
export function isAdmin(role: string): boolean {
  return role === "ADMIN";
}

/** Vérifie si un rôle est employé */
export function isEmployee(role: string): boolean {
  return role === "EMPLOYEE";
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
  | "manage_unavailabilities";

/** Matrice rôle → permissions */
export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  ADMIN: [
    // Tout
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
    case "ADMIN":
    case "MANAGER":
      return "/planning";
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
