/**
 * Tests d'isolation multi-tenant — couche pure (sans DB ni NextAuth).
 *
 * Phase 1 — Vérifie que :
 *   1. enforceCompanyScope injecte automatiquement companyId
 *   2. SUPER_ADMIN bypasse le filtre (cross-company OK)
 *   3. Toute tentative cross-company lève CrossCompanyAccessError
 *   4. Le rôle OWNER existe et est correctement hiérarchisé
 *   5. Les helpers de rôle reconnaissent OWNER
 */
import {
  enforceCompanyScope,
  CrossCompanyAccessError,
  SAAS_ROLE_LEVEL,
  hasMinimumSaasRole,
  isOwner,
  isCompanyAdmin,
  type CompanyContext,
} from "@/lib/company-context-pure";

const owner = (companyId: string): CompanyContext => ({
  userId: "u_owner",
  role: "OWNER",
  companyId,
  isPlatformAdmin: false,
});

const admin = (companyId: string): CompanyContext => ({
  userId: "u_admin",
  role: "ADMIN",
  companyId,
  isPlatformAdmin: false,
});

const manager = (companyId: string): CompanyContext => ({
  userId: "u_mgr",
  role: "MANAGER",
  companyId,
  isPlatformAdmin: false,
});

const employee = (companyId: string): CompanyContext => ({
  userId: "u_emp",
  role: "EMPLOYEE",
  companyId,
  isPlatformAdmin: false,
});

const superAdmin = (companyId: string | null = null): CompanyContext => ({
  userId: "u_super",
  role: "SUPER_ADMIN",
  companyId,
  isPlatformAdmin: true,
});

// ─── enforceCompanyScope ───────────────────────────────────────────────────
describe("enforceCompanyScope — injection automatique de companyId", () => {
  it("INJECTE companyId pour un OWNER", () => {
    const where = enforceCompanyScope({ active: true }, owner("co_A"));
    expect(where).toEqual({ active: true, companyId: "co_A" });
  });

  it("INJECTE companyId pour un ADMIN", () => {
    const where = enforceCompanyScope({ status: "ACTIVE" }, admin("co_A"));
    expect(where.companyId).toBe("co_A");
  });

  it("INJECTE companyId pour un MANAGER", () => {
    const where = enforceCompanyScope({ storeId: "s_1" }, manager("co_A"));
    expect(where).toEqual({ storeId: "s_1", companyId: "co_A" });
  });

  it("INJECTE companyId pour un EMPLOYEE", () => {
    const where = enforceCompanyScope({ employeeId: "e_1" }, employee("co_A"));
    expect(where.companyId).toBe("co_A");
  });

  it("BYPASS pour SUPER_ADMIN — aucun filtre forcé", () => {
    const where = enforceCompanyScope({ active: true }, superAdmin());
    expect(where).toEqual({ active: true });
    expect((where as { companyId?: string }).companyId).toBeUndefined();
  });

  it("BYPASS pour SUPER_ADMIN même avec companyId fourni — laisse passer", () => {
    const where = enforceCompanyScope(
      { active: true, companyId: "co_X" },
      superAdmin()
    );
    expect(where).toEqual({ active: true, companyId: "co_X" });
  });

  it("préserve les autres champs de where", () => {
    const where = enforceCompanyScope(
      { active: true, role: "MANAGER", email: { contains: "@" } },
      admin("co_A")
    );
    expect(where).toMatchObject({
      active: true,
      role: "MANAGER",
      email: { contains: "@" },
      companyId: "co_A",
    });
  });
});

// ─── Cross-company prevention ──────────────────────────────────────────────
describe("CrossCompanyAccessError — détection cross-company", () => {
  it("LÈVE l'erreur quand where.companyId ≠ ctx.companyId", () => {
    expect(() =>
      enforceCompanyScope({ companyId: "co_B" }, admin("co_A"))
    ).toThrow(CrossCompanyAccessError);
  });

  it("ACCEPTE when where.companyId === ctx.companyId (redondant mais OK)", () => {
    const where = enforceCompanyScope({ companyId: "co_A" }, owner("co_A"));
    expect(where.companyId).toBe("co_A");
  });

  it("LÈVE l'erreur si ctx companyless (rôle non-SUPER_ADMIN)", () => {
    const malformedCtx: CompanyContext = {
      userId: "u_bug",
      role: "ADMIN",
      companyId: null,
      isPlatformAdmin: false,
    };
    expect(() => enforceCompanyScope({ active: true }, malformedCtx)).toThrow(
      CrossCompanyAccessError
    );
  });

  it("le flag isCrossCompanyAccess est exposé pour catch typé", () => {
    try {
      enforceCompanyScope({ companyId: "co_B" }, admin("co_A"));
      fail("aurait dû throw");
    } catch (err) {
      expect((err as CrossCompanyAccessError).isCrossCompanyAccess).toBe(true);
      expect((err as Error).message).toContain("cross-company");
    }
  });
});

// ─── Hiérarchie des rôles SaaS ─────────────────────────────────────────────
describe("Hiérarchie des rôles SaaS", () => {
  it("SUPER_ADMIN est au sommet (5)", () => {
    expect(SAAS_ROLE_LEVEL.SUPER_ADMIN).toBe(5);
  });

  it("OWNER est en-dessous de SUPER_ADMIN (4)", () => {
    expect(SAAS_ROLE_LEVEL.OWNER).toBe(4);
    expect(SAAS_ROLE_LEVEL.OWNER).toBeLessThan(SAAS_ROLE_LEVEL.SUPER_ADMIN);
  });

  it("ADMIN est en-dessous d'OWNER (3)", () => {
    expect(SAAS_ROLE_LEVEL.ADMIN).toBe(3);
    expect(SAAS_ROLE_LEVEL.ADMIN).toBeLessThan(SAAS_ROLE_LEVEL.OWNER);
  });

  it("MANAGER (2) > EMPLOYEE (1)", () => {
    expect(SAAS_ROLE_LEVEL.MANAGER).toBe(2);
    expect(SAAS_ROLE_LEVEL.EMPLOYEE).toBe(1);
  });

  it("hasMinimumSaasRole : OWNER ≥ ADMIN", () => {
    expect(hasMinimumSaasRole("OWNER", "ADMIN")).toBe(true);
  });

  it("hasMinimumSaasRole : MANAGER < ADMIN", () => {
    expect(hasMinimumSaasRole("MANAGER", "ADMIN")).toBe(false);
  });

  it("hasMinimumSaasRole : EMPLOYEE < OWNER", () => {
    expect(hasMinimumSaasRole("EMPLOYEE", "OWNER")).toBe(false);
  });

  it("hasMinimumSaasRole : rôle inconnu retourne false", () => {
    expect(hasMinimumSaasRole("HACKER", "EMPLOYEE")).toBe(false);
  });
});

// ─── Helpers de rôle ───────────────────────────────────────────────────────
describe("Helpers de rôle OWNER / Company admin", () => {
  it("isOwner reconnaît OWNER", () => {
    expect(isOwner("OWNER")).toBe(true);
    expect(isOwner("ADMIN")).toBe(false);
    expect(isOwner("SUPER_ADMIN")).toBe(false);
    expect(isOwner("EMPLOYEE")).toBe(false);
  });

  it("isCompanyAdmin reconnaît OWNER, ADMIN, SUPER_ADMIN", () => {
    expect(isCompanyAdmin("OWNER")).toBe(true);
    expect(isCompanyAdmin("ADMIN")).toBe(true);
    expect(isCompanyAdmin("SUPER_ADMIN")).toBe(true);
    expect(isCompanyAdmin("MANAGER")).toBe(false);
    expect(isCompanyAdmin("EMPLOYEE")).toBe(false);
  });
});

// ─── Cas critiques — protection légale ────────────────────────────────────
describe("Cas critiques d'isolation multi-tenant", () => {
  it("Manager Company A ne peut PAS forcer un filtre sur Company B", () => {
    const ctxA = manager("co_A");
    expect(() =>
      enforceCompanyScope({ companyId: "co_B" }, ctxA)
    ).toThrow(CrossCompanyAccessError);
  });

  it("Owner Company A — sa requête est toujours scopée à Company A", () => {
    const where = enforceCompanyScope({}, owner("co_A"));
    expect(where.companyId).toBe("co_A");
  });

  it("Owner Company A — même en passant where.companyId='co_A' (no-op)", () => {
    const where = enforceCompanyScope({ companyId: "co_A" }, owner("co_A"));
    expect(where.companyId).toBe("co_A");
  });

  it("Employee Company A — requête de ses propres données toujours scopée", () => {
    const where = enforceCompanyScope(
      { employeeId: "e_self" },
      employee("co_A")
    );
    expect(where).toEqual({ employeeId: "e_self", companyId: "co_A" });
  });

  it("Régression — un Manager ne doit JAMAIS récupérer les shifts d'une autre Company même s'il connaît l'ID magasin", () => {
    // Simulation : le manager fournit storeId=s_999 (qui appartient à co_B)
    // enforceCompanyScope force companyId=co_A → la query Prisma retournera []
    const where = enforceCompanyScope({ storeId: "s_999" }, manager("co_A"));
    expect(where).toMatchObject({ storeId: "s_999", companyId: "co_A" });
    // → Prisma fera : WHERE storeId='s_999' AND companyId='co_A'
    //   → zéro ligne car le store appartient à co_B
  });
});
