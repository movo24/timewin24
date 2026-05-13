/**
 * Tests SaaS pour `applyNotifyRbac` étendu (Phase 2).
 *
 * Couvre les nouvelles règles :
 *   - cross-company refusée (sauf SUPER_ADMIN)
 *   - OWNER autorisé dans SA Company uniquement
 *   - Manager sans companyId → refusé
 */
import { applyNotifyRbac } from "@/lib/notifications/notify-helpers";

describe("applyNotifyRbac — multi-tenant SaaS (Phase 2)", () => {
  // ─── SUPER_ADMIN bypass cross-company ────────────────────────────────────
  it("SUPER_ADMIN : accès cross-company OK même si userCompanyId ≠ requestedCompanyId", () => {
    const r = applyNotifyRbac({
      role: "SUPER_ADMIN",
      accessibleStoreIds: null,
      userCompanyId: null, // staff plateforme
      requestedCompanyId: "co_A",
    });
    expect(r.ok).toBe(true);
  });

  it("SUPER_ADMIN : pas besoin de store ni de companyId", () => {
    const r = applyNotifyRbac({
      role: "SUPER_ADMIN",
      accessibleStoreIds: null,
    });
    expect(r.ok).toBe(true);
  });

  // ─── OWNER scope COMPANY ─────────────────────────────────────────────────
  it("OWNER : OK pour sa propre Company", () => {
    const r = applyNotifyRbac({
      role: "OWNER",
      accessibleStoreIds: null,
      userCompanyId: "co_A",
      requestedCompanyId: "co_A",
    });
    expect(r.ok).toBe(true);
  });

  it("OWNER : REFUSÉ pour une autre Company", () => {
    const r = applyNotifyRbac({
      role: "OWNER",
      accessibleStoreIds: null,
      userCompanyId: "co_A",
      requestedCompanyId: "co_B",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason.toLowerCase()).toContain("hors de votre company");
    }
  });

  it("OWNER : OK sans requestedCompanyId (envoi multi-store de sa Company)", () => {
    const r = applyNotifyRbac({
      role: "OWNER",
      accessibleStoreIds: null,
      userCompanyId: "co_A",
    });
    expect(r.ok).toBe(true);
  });

  it("OWNER : REFUSÉ si userCompanyId est null (compte non assigné)", () => {
    const r = applyNotifyRbac({
      role: "OWNER",
      accessibleStoreIds: null,
      userCompanyId: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.toLowerCase()).toContain("sans company");
    }
  });

  // ─── ADMIN scope COMPANY ─────────────────────────────────────────────────
  it("ADMIN : OK pour sa propre Company", () => {
    const r = applyNotifyRbac({
      role: "ADMIN",
      accessibleStoreIds: null,
      userCompanyId: "co_A",
      requestedCompanyId: "co_A",
    });
    expect(r.ok).toBe(true);
  });

  it("ADMIN : REFUSÉ cross-company", () => {
    const r = applyNotifyRbac({
      role: "ADMIN",
      accessibleStoreIds: null,
      userCompanyId: "co_A",
      requestedCompanyId: "co_B",
    });
    expect(r.ok).toBe(false);
  });

  // ─── MANAGER scope COMPANY + STORE ───────────────────────────────────────
  it("MANAGER : OK pour son store dans sa Company", () => {
    const r = applyNotifyRbac({
      role: "MANAGER",
      accessibleStoreIds: ["store_1"],
      requestedStoreId: "store_1",
      userCompanyId: "co_A",
      requestedCompanyId: "co_A",
    });
    expect(r.ok).toBe(true);
  });

  it("MANAGER : REFUSÉ cross-company (même si store est dans accessibleStoreIds)", () => {
    const r = applyNotifyRbac({
      role: "MANAGER",
      accessibleStoreIds: ["store_1"],
      requestedStoreId: "store_1",
      userCompanyId: "co_A",
      requestedCompanyId: "co_B",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.toLowerCase()).toContain("hors de votre company");
    }
  });

  it("MANAGER : REFUSÉ si userCompanyId null", () => {
    const r = applyNotifyRbac({
      role: "MANAGER",
      accessibleStoreIds: ["store_1"],
      requestedStoreId: "store_1",
      userCompanyId: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason.toLowerCase()).toContain("sans company");
    }
  });

  // ─── EMPLOYEE bloqué quel que soit le contexte ───────────────────────────
  it("EMPLOYEE : REFUSÉ même avec companyId correct", () => {
    const r = applyNotifyRbac({
      role: "EMPLOYEE",
      accessibleStoreIds: ["store_1"],
      userCompanyId: "co_A",
      requestedCompanyId: "co_A",
    });
    expect(r.ok).toBe(false);
  });

  // ─── Compat rétro : userCompanyId undefined = mode legacy ────────────────
  // Les anciens tests (notify-rbac-batch.test.ts) ne passent pas userCompanyId.
  // Dans ce mode legacy, le check companyId est désactivé pour ne pas casser
  // les routes/tests pré-Phase-2. Les nouvelles routes DOIVENT passer
  // userCompanyId (string ou null explicite) pour activer le contrôle SaaS.
  it("Compat rétro : userCompanyId UNDEFINED = mode legacy (OWNER/ADMIN → OK)", () => {
    expect(
      applyNotifyRbac({ role: "OWNER", accessibleStoreIds: null }).ok
    ).toBe(true);
    expect(
      applyNotifyRbac({ role: "ADMIN", accessibleStoreIds: null }).ok
    ).toBe(true);
  });

  it("Mode SaaS strict : userCompanyId=null EXPLICITE = refusé pour OWNER/ADMIN/MANAGER", () => {
    // Le `null` explicite signifie "le user a été chargé mais n'a pas de Company"
    expect(
      applyNotifyRbac({
        role: "OWNER",
        accessibleStoreIds: null,
        userCompanyId: null,
      }).ok
    ).toBe(false);
    expect(
      applyNotifyRbac({
        role: "ADMIN",
        accessibleStoreIds: null,
        userCompanyId: null,
      }).ok
    ).toBe(false);
    expect(
      applyNotifyRbac({
        role: "MANAGER",
        accessibleStoreIds: ["store_1"],
        requestedStoreId: "store_1",
        userCompanyId: null,
      }).ok
    ).toBe(false);
  });

  it("Mode SaaS strict : SUPER_ADMIN avec userCompanyId=null OK (staff plateforme)", () => {
    expect(
      applyNotifyRbac({
        role: "SUPER_ADMIN",
        accessibleStoreIds: null,
        userCompanyId: null,
      }).ok
    ).toBe(true);
  });
});
