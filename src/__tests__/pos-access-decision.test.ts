import { evaluatePosAccess, type PosAccessInput } from "@/lib/pos/access-decision";

// POS — décision d'accès caisse. TimeWin24 n'est pas une dépendance bloquante :
// l'employé actif et autorisé travaille même hors planning, mais une alerte
// d'exception est remontée. Refus uniquement si inactif/non autorisé/radié.

const ok: PosAccessInput = {
  exists: true,
  active: true,
  cashierAuthorized: true,
  assignedToStore: true,
  scheduledNow: true,
};

describe("evaluatePosAccess", () => {
  it("employé prévu au planning : accès, aucune alerte", () => {
    const r = evaluatePosAccess(ok);
    expect(r).toEqual({
      status: "OK",
      decision: "granted",
      alertLevel: "none",
      reason: "scheduled",
      requiresReview: false,
    });
  });

  it("employé actif mais NON prévu : accès accordé + exception urgente", () => {
    const r = evaluatePosAccess({ ...ok, scheduledNow: false });
    expect(r.decision).toBe("granted");
    expect(r.status).toBe("UNSCHEDULED");
    expect(r.alertLevel).toBe("urgent");
    expect(r.requiresReview).toBe(true);
    expect(r.reason).toBe("employee_active_and_cashier_authorized");
  });

  it("code inconnu : refus critique", () => {
    const r = evaluatePosAccess({ ...ok, exists: false, scheduledNow: false });
    expect(r).toMatchObject({ status: "FORBIDDEN", decision: "denied", alertLevel: "critical", reason: "unknown_code" });
  });

  it("employé désactivé / radié : refus critique", () => {
    const r = evaluatePosAccess({ ...ok, active: false });
    expect(r.decision).toBe("denied");
    expect(r.reason).toBe("inactive");
  });

  it("sans droit caisse : refus critique", () => {
    const r = evaluatePosAccess({ ...ok, cashierAuthorized: false });
    expect(r.decision).toBe("denied");
    expect(r.reason).toBe("not_cashier_authorized");
  });

  it("non affecté à ce magasin : refus critique", () => {
    const r = evaluatePosAccess({ ...ok, assignedToStore: false });
    expect(r.decision).toBe("denied");
    expect(r.reason).toBe("wrong_store");
  });

  it("priorité des motifs de refus : inactif l'emporte sur droit caisse", () => {
    // points 1→4 évalués dans l'ordre : le premier échec donne le motif
    const r = evaluatePosAccess({ ...ok, active: false, cashierAuthorized: false });
    expect(r.reason).toBe("inactive");
  });

  it("un refus (points 1→4) n'est jamais transformé en simple exception planning", () => {
    // même non prévu, un employé inactif reste REFUSÉ (sécurité avant continuité)
    const r = evaluatePosAccess({ ...ok, active: false, scheduledNow: false });
    expect(r.status).toBe("FORBIDDEN");
    expect(r.decision).toBe("denied");
  });
});
