import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasMinimumRole,
  isAdmin,
  isAdminOrManager,
  isSuperAdmin,
  isEmployee,
  getDefaultRouteForRole,
  ROLE_HIERARCHY,
} from "@/lib/rbac";

// M116 / DEBT-023 — couverture de la matrice RBAC (lib/rbac.ts).
// Les permissions sont la frontière d'autorisation centrale (requireManagerOrAdmin ×102,
// requireAdmin ×90) — ces tests verrouillent le comportement attendu par rôle.

describe("ROLE_HIERARCHY & hasMinimumRole", () => {
  it("ordonne les rôles correctement", () => {
    expect(ROLE_HIERARCHY.EMPLOYEE).toBeLessThan(ROLE_HIERARCHY.MANAGER);
    expect(ROLE_HIERARCHY.MANAGER).toBeLessThan(ROLE_HIERARCHY.ADMIN);
    expect(ROLE_HIERARCHY.ADMIN).toBeLessThan(ROLE_HIERARCHY.SUPER_ADMIN);
  });

  it("hasMinimumRole respecte la hiérarchie", () => {
    expect(hasMinimumRole("ADMIN", "MANAGER")).toBe(true);
    expect(hasMinimumRole("MANAGER", "ADMIN")).toBe(false);
    expect(hasMinimumRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(hasMinimumRole("EMPLOYEE", "EMPLOYEE")).toBe(true);
  });

  it("rôle inconnu → false", () => {
    expect(hasMinimumRole("GHOST", "EMPLOYEE")).toBe(false);
  });
});

describe("helpers de rôle", () => {
  it("isAdmin", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("SUPER_ADMIN")).toBe(true);
    expect(isAdmin("MANAGER")).toBe(false);
    expect(isAdmin("EMPLOYEE")).toBe(false);
  });
  it("isAdminOrManager", () => {
    expect(isAdminOrManager("MANAGER")).toBe(true);
    expect(isAdminOrManager("EMPLOYEE")).toBe(false);
  });
  it("isSuperAdmin / isEmployee", () => {
    expect(isSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(isSuperAdmin("ADMIN")).toBe(false);
    expect(isEmployee("EMPLOYEE")).toBe(true);
    expect(isEmployee("MANAGER")).toBe(false);
  });
});

describe("hasPermission — EMPLOYEE", () => {
  it("a ses permissions propres", () => {
    expect(hasPermission("EMPLOYEE", "view_own_schedule")).toBe(true);
    expect(hasPermission("EMPLOYEE", "clock_in")).toBe(true);
    expect(hasPermission("EMPLOYEE", "claim_market_listing")).toBe(true);
  });
  it("ne peut PAS gérer / voir l'admin", () => {
    expect(hasPermission("EMPLOYEE", "manage_employees")).toBe(false);
    expect(hasPermission("EMPLOYEE", "manage_accounts")).toBe(false);
    expect(hasPermission("EMPLOYEE", "view_costs")).toBe(false);
    expect(hasPermission("EMPLOYEE", "edit_schedule")).toBe(false);
    expect(hasPermission("EMPLOYEE", "view_audit")).toBe(false);
  });
});

describe("hasPermission — MANAGER", () => {
  it("gère le quotidien magasin", () => {
    expect(hasPermission("MANAGER", "edit_schedule")).toBe(true);
    expect(hasPermission("MANAGER", "manage_absences")).toBe(true);
    expect(hasPermission("MANAGER", "view_costs")).toBe(true);
  });
  it("ne gère PAS comptes / employés / magasins / coûts / orgs", () => {
    expect(hasPermission("MANAGER", "manage_accounts")).toBe(false);
    expect(hasPermission("MANAGER", "manage_employees")).toBe(false);
    expect(hasPermission("MANAGER", "manage_stores")).toBe(false);
    expect(hasPermission("MANAGER", "manage_costs")).toBe(false);
    expect(hasPermission("MANAGER", "view_audit")).toBe(false);
    expect(hasPermission("MANAGER", "manage_integrations")).toBe(false);
    expect(hasPermission("MANAGER", "manage_organizations")).toBe(false);
  });
});

describe("hasPermission — ADMIN vs SUPER_ADMIN", () => {
  it("ADMIN gère comptes/employés/coûts mais PAS les organisations", () => {
    expect(hasPermission("ADMIN", "manage_accounts")).toBe(true);
    expect(hasPermission("ADMIN", "manage_employees")).toBe(true);
    expect(hasPermission("ADMIN", "manage_costs")).toBe(true);
    expect(hasPermission("ADMIN", "manage_organizations")).toBe(false);
  });
  it("SUPER_ADMIN gère les organisations", () => {
    expect(hasPermission("SUPER_ADMIN", "manage_organizations")).toBe(true);
  });
  it("rôle inconnu → aucune permission", () => {
    expect(hasPermission("GHOST", "view_own_schedule")).toBe(false);
  });
});

describe("hasAnyPermission / hasAllPermissions", () => {
  it("any", () => {
    expect(hasAnyPermission("EMPLOYEE", ["manage_accounts", "clock_in"])).toBe(true);
    expect(hasAnyPermission("EMPLOYEE", ["manage_accounts", "view_audit"])).toBe(false);
  });
  it("all", () => {
    expect(hasAllPermissions("ADMIN", ["manage_accounts", "manage_employees"])).toBe(true);
    expect(hasAllPermissions("MANAGER", ["edit_schedule", "manage_accounts"])).toBe(false);
  });
});

describe("getDefaultRouteForRole", () => {
  it("route par rôle", () => {
    expect(getDefaultRouteForRole("SUPER_ADMIN")).toBe("/organizations");
    expect(getDefaultRouteForRole("ADMIN")).toBe("/dashboard");
    expect(getDefaultRouteForRole("MANAGER")).toBe("/dashboard");
    expect(getDefaultRouteForRole("EMPLOYEE")).toBe("/mon-planning");
    expect(getDefaultRouteForRole("GHOST")).toBe("/login");
  });
});
