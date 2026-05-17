/**
 * Tests SaaS App Store — hiérarchie + helpers spécifiques au scope COMPANY.
 *
 * Cible la règle absolue :
 *   SUPER_ADMIN = scope PLATEFORME (cross-company)
 *   OWNER       = scope COMPANY UNIQUEMENT (ne doit JAMAIS hériter du
 *                 comportement SUPER_ADMIN)
 */
import {
  isAdmin,
  isAdminOrManager,
  isSuperAdmin,
  isPlatformAdmin,
  isCompanyAdmin,
  isOwner,
  isEmployee,
  isCompanyScoped,
  hasMinimumRole,
  ROLE_HIERARCHY,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  hasPermission,
  getDefaultRouteForRole,
} from "@/lib/rbac";

// ─── Hiérarchie des rôles ──────────────────────────────────────────────────
describe("ROLE_HIERARCHY — SaaS App Store", () => {
  it("contient les 5 rôles attendus", () => {
    expect(Object.keys(ROLE_HIERARCHY).sort()).toEqual([
      "ADMIN",
      "EMPLOYEE",
      "MANAGER",
      "OWNER",
      "SUPER_ADMIN",
    ]);
  });

  it("SUPER_ADMIN > OWNER > ADMIN > MANAGER > EMPLOYEE", () => {
    expect(ROLE_HIERARCHY.SUPER_ADMIN).toBeGreaterThan(ROLE_HIERARCHY.OWNER);
    expect(ROLE_HIERARCHY.OWNER).toBeGreaterThan(ROLE_HIERARCHY.ADMIN);
    expect(ROLE_HIERARCHY.ADMIN).toBeGreaterThan(ROLE_HIERARCHY.MANAGER);
    expect(ROLE_HIERARCHY.MANAGER).toBeGreaterThan(ROLE_HIERARCHY.EMPLOYEE);
  });

  it("OWNER est niveau 4, SUPER_ADMIN niveau 5", () => {
    expect(ROLE_HIERARCHY.OWNER).toBe(4);
    expect(ROLE_HIERARCHY.SUPER_ADMIN).toBe(5);
  });

  it("hasMinimumRole : OWNER ≥ ADMIN", () => {
    expect(hasMinimumRole("OWNER", "ADMIN")).toBe(true);
  });

  it("hasMinimumRole : OWNER < SUPER_ADMIN (verrou plateforme)", () => {
    expect(hasMinimumRole("OWNER", "SUPER_ADMIN")).toBe(false);
  });

  it("ROLE_LABELS contient OWNER", () => {
    expect(ROLE_LABELS.OWNER).toBe("Propriétaire");
  });
});

// ─── Helpers SaaS : distinction plateforme vs company ──────────────────────
describe("isPlatformAdmin — verrou plateforme strict", () => {
  it("SEUL SUPER_ADMIN est platform admin", () => {
    expect(isPlatformAdmin("SUPER_ADMIN")).toBe(true);
    expect(isPlatformAdmin("OWNER")).toBe(false); // critique
    expect(isPlatformAdmin("ADMIN")).toBe(false);
    expect(isPlatformAdmin("MANAGER")).toBe(false);
    expect(isPlatformAdmin("EMPLOYEE")).toBe(false);
  });

  it("régression : OWNER ne doit JAMAIS être traité comme platform admin", () => {
    // C'est LA règle absolue du SaaS multi-tenant
    expect(isPlatformAdmin("OWNER")).toBe(false);
  });
});

describe("isCompanyAdmin — admin AU SEIN de sa Company", () => {
  it("OWNER + ADMIN + SUPER_ADMIN sont company admin", () => {
    expect(isCompanyAdmin("OWNER")).toBe(true);
    expect(isCompanyAdmin("ADMIN")).toBe(true);
    expect(isCompanyAdmin("SUPER_ADMIN")).toBe(true);
  });

  it("MANAGER et EMPLOYEE ne sont PAS company admin", () => {
    expect(isCompanyAdmin("MANAGER")).toBe(false);
    expect(isCompanyAdmin("EMPLOYEE")).toBe(false);
  });
});

describe("isCompanyScoped — confiné à UNE Company", () => {
  it("OWNER / ADMIN / MANAGER / EMPLOYEE sont scopés", () => {
    expect(isCompanyScoped("OWNER")).toBe(true);
    expect(isCompanyScoped("ADMIN")).toBe(true);
    expect(isCompanyScoped("MANAGER")).toBe(true);
    expect(isCompanyScoped("EMPLOYEE")).toBe(true);
  });

  it("SUPER_ADMIN n'est PAS scopé (cross-company autorisé)", () => {
    expect(isCompanyScoped("SUPER_ADMIN")).toBe(false);
  });
});

describe("isOwner / isAdmin / isAdminOrManager / isEmployee", () => {
  it("isOwner ne reconnaît QUE OWNER", () => {
    expect(isOwner("OWNER")).toBe(true);
    expect(isOwner("ADMIN")).toBe(false);
    expect(isOwner("SUPER_ADMIN")).toBe(false);
  });

  it("isAdmin (legacy) ne reconnaît PAS OWNER", () => {
    // RÈGLE CRITIQUE : isAdmin garde l'ancien comportement pour ne pas
    // ouvrir d'accès cross-company via getAccessibleStoreIds. OWNER doit
    // utiliser isCompanyAdmin.
    expect(isAdmin("OWNER")).toBe(false);
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("SUPER_ADMIN")).toBe(true);
  });

  it("isAdminOrManager reconnaît OWNER (SaaS update Phase 8)", () => {
    // Mise à jour Phase 8 : OWNER est inclus dans isAdminOrManager pour
    // permettre l'accès au dashboard. L'isolation cross-company est
    // garantie par enforceCompanyScope au niveau query, pas par ce guard.
    expect(isAdminOrManager("OWNER")).toBe(true);
  });

  it("isSuperAdmin", () => {
    expect(isSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(isSuperAdmin("OWNER")).toBe(false);
  });

  it("isEmployee", () => {
    expect(isEmployee("EMPLOYEE")).toBe(true);
    expect(isEmployee("OWNER")).toBe(false);
  });
});

// ─── ROLE_PERMISSIONS pour OWNER ───────────────────────────────────────────
describe("ROLE_PERMISSIONS — OWNER", () => {
  it("OWNER a les permissions admin de sa Company", () => {
    expect(ROLE_PERMISSIONS.OWNER).toContain("edit_schedule");
    expect(ROLE_PERMISSIONS.OWNER).toContain("manage_employees");
    expect(ROLE_PERMISSIONS.OWNER).toContain("manage_stores");
    expect(ROLE_PERMISSIONS.OWNER).toContain("manage_accounts");
    expect(ROLE_PERMISSIONS.OWNER).toContain("view_audit");
  });

  it("OWNER n'a PAS les permissions plateforme", () => {
    // Pas de gestion des intégrations POS ou orgs (réservé ADMIN/SUPER_ADMIN)
    expect(ROLE_PERMISSIONS.OWNER).not.toContain("manage_integrations");
    expect(ROLE_PERMISSIONS.OWNER).not.toContain("view_pos_events");
    expect(ROLE_PERMISSIONS.OWNER).not.toContain("manage_connected_apps");
    expect(ROLE_PERMISSIONS.OWNER).not.toContain("view_organizations");
    expect(ROLE_PERMISSIONS.OWNER).not.toContain("manage_units");
  });

  it("hasPermission OWNER edit_schedule", () => {
    expect(hasPermission("OWNER", "edit_schedule")).toBe(true);
  });

  it("hasPermission OWNER manage_integrations (NON)", () => {
    expect(hasPermission("OWNER", "manage_integrations")).toBe(false);
  });
});

// ─── Routes par défaut ─────────────────────────────────────────────────────
describe("getDefaultRouteForRole — OWNER", () => {
  it("OWNER → /dashboard (comme ADMIN)", () => {
    expect(getDefaultRouteForRole("OWNER")).toBe("/dashboard");
  });

  it("SUPER_ADMIN → /organizations (scope plateforme)", () => {
    expect(getDefaultRouteForRole("SUPER_ADMIN")).toBe("/organizations");
  });

  it("EMPLOYEE → /mon-planning", () => {
    expect(getDefaultRouteForRole("EMPLOYEE")).toBe("/mon-planning");
  });
});
