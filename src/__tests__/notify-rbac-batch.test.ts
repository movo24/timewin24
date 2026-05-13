import {
  applyNotifyRbac,
  chunkArray,
  planBatches,
  summarizeSendResults,
} from "@/lib/notifications/notify-helpers";

// ─── Test 7 — Manager hors périmètre ─────────────────────────────────────
describe("applyNotifyRbac — Manager scope", () => {
  const managerWith = (stores: string[]) => ({
    role: "MANAGER" as const,
    accessibleStoreIds: stores,
  });

  it("REFUSE un manager qui n'a pas spécifié de magasin", () => {
    const r = applyNotifyRbac({
      ...managerWith(["PAR-001"]),
      requestedStoreId: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason).toContain("magasin");
    }
  });

  it("REFUSE un manager qui demande un magasin hors périmètre", () => {
    const r = applyNotifyRbac({
      ...managerWith(["PAR-001"]),
      requestedStoreId: "MAR-001", // pas autorisé
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.reason.toLowerCase()).toContain("hors périmètre");
    }
  });

  it("ACCEPTE un manager qui demande un de ses magasins", () => {
    const r = applyNotifyRbac({
      ...managerWith(["PAR-001", "PAR-002"]),
      requestedStoreId: "PAR-002",
    });
    expect(r.ok).toBe(true);
  });

  it("REFUSE un manager sans aucun magasin assigné", () => {
    const r = applyNotifyRbac({
      ...managerWith([]),
      requestedStoreId: "PAR-001",
    });
    expect(r.ok).toBe(false);
  });

  it("ACCEPTE un ADMIN sans contrainte de magasin", () => {
    const r = applyNotifyRbac({
      role: "ADMIN",
      accessibleStoreIds: null,
      requestedStoreId: undefined,
    });
    expect(r.ok).toBe(true);
  });

  it("ACCEPTE un SUPER_ADMIN sans contrainte de magasin", () => {
    const r = applyNotifyRbac({
      role: "SUPER_ADMIN",
      accessibleStoreIds: null,
    });
    expect(r.ok).toBe(true);
  });

  it("ACCEPTE un ADMIN qui spécifie un magasin précis", () => {
    const r = applyNotifyRbac({
      role: "ADMIN",
      accessibleStoreIds: null,
      requestedStoreId: "MAR-001",
    });
    expect(r.ok).toBe(true);
  });

  it("REFUSE un EMPLOYEE", () => {
    const r = applyNotifyRbac({
      role: "EMPLOYEE",
      accessibleStoreIds: ["PAR-001"],
      requestedStoreId: "PAR-001",
    });
    expect(r.ok).toBe(false);
  });

  // ─── Régression : la couche RBAC seule n'est pas suffisante quand un
  // ───  employeeId est fourni. Le route doit vérifier en plus que l'employé
  // ───  appartient à un magasin du manager. Documente l'attente.
  it("documente que applyNotifyRbac NE vérifie PAS l'employeeId — le route doit le faire séparément", () => {
    // Ce test est volontairement faible : applyNotifyRbac valide juste le
    // périmètre du storeId. La vérification de cross-store via employeeId
    // est faite par une requête StoreEmployee dans la route POST/notify.
    const r = applyNotifyRbac({
      role: "MANAGER",
      accessibleStoreIds: ["PAR-001"],
      requestedStoreId: "PAR-001",
      // (Pas de field employeeId dans le helper — c'est volontaire.)
    });
    expect(r.ok).toBe(true);
  });
});

// ─── Test 8 — 60 employés batch ──────────────────────────────────────────
describe("chunkArray + planBatches — Batching strategy", () => {
  it("découpe 60 employés en 6 lots de 10", () => {
    const arr = Array.from({ length: 60 }, (_, i) => `emp_${i}`);
    const chunks = chunkArray(arr, 10);
    expect(chunks).toHaveLength(6);
    expect(chunks[0]).toHaveLength(10);
    expect(chunks[5]).toHaveLength(10);
  });

  it("découpe 65 employés en 7 lots (le dernier de 5)", () => {
    const arr = Array.from({ length: 65 }, (_, i) => `emp_${i}`);
    const chunks = chunkArray(arr, 10);
    expect(chunks).toHaveLength(7);
    expect(chunks[6]).toHaveLength(5);
  });

  it("découpe 1 employé en 1 lot", () => {
    expect(chunkArray(["only"], 10)).toEqual([["only"]]);
  });

  it("découpe 0 employé en 0 lot", () => {
    expect(chunkArray([], 10)).toEqual([]);
  });

  it("planBatches : 60 employés / 10 par lot / 1s pause = 5s total pause", () => {
    const plan = planBatches(60, 10, 1000);
    expect(plan.batches).toBe(6);
    expect(plan.lastBatchSize).toBe(10);
    expect(plan.totalPauseMs).toBe(5000); // 5 pauses entre 6 lots
  });

  it("planBatches : 1 employé = 0 pause", () => {
    const plan = planBatches(1, 10, 1000);
    expect(plan.batches).toBe(1);
    expect(plan.totalPauseMs).toBe(0);
  });

  it("planBatches : 0 employé = aucun lot, aucune pause", () => {
    expect(planBatches(0, 10, 1000)).toEqual({
      batches: 0,
      lastBatchSize: 0,
      totalPauseMs: 0,
    });
  });

  it("planBatches : 100 employés avec lots de 25 = 4 lots, 3 pauses", () => {
    const plan = planBatches(100, 25, 1000);
    expect(plan.batches).toBe(4);
    expect(plan.lastBatchSize).toBe(25);
    expect(plan.totalPauseMs).toBe(3000);
  });

  it("chunk size = 0 ou négatif : erreur", () => {
    expect(() => chunkArray([1, 2, 3], 0)).toThrow();
    expect(() => chunkArray([1, 2, 3], -5)).toThrow();
  });
});

// ─── Test critique : Promise.allSettled isole les échecs unitaires ──────
describe("Batching robustness — Promise.allSettled vs Promise.all", () => {
  it("Promise.all : 1 reject → toutes les tâches restantes ne sont pas observées (regression)", async () => {
    let runs = 0;
    const tasks = [
      async () => { runs++; },
      async () => { runs++; throw new Error("boom"); },
      async () => { runs++; },
    ];
    try {
      await Promise.all(tasks.map((t) => t()));
    } catch {
      // expected
    }
    // Les tâches commencent toutes (elles sont synchrones jusqu'au throw)
    expect(runs).toBeGreaterThanOrEqual(2);
  });

  it("Promise.allSettled : aucune exception remontée, tous les résultats accessibles", async () => {
    let runs = 0;
    const tasks = [
      async () => { runs++; return "ok1"; },
      async () => { runs++; throw new Error("boom"); },
      async () => { runs++; return "ok3"; },
    ];
    const settled = await Promise.allSettled(tasks.map((t) => t()));
    expect(runs).toBe(3);
    expect(settled[0].status).toBe("fulfilled");
    expect(settled[1].status).toBe("rejected");
    expect(settled[2].status).toBe("fulfilled");
  });

  it("Avec sendOne enveloppé dans try/catch, allSettled garde tout en 'fulfilled'", async () => {
    // Reproduit le pattern du route: chaque sendOne catche son erreur
    // et écrit un résultat. allSettled garantit que toutes les promesses
    // résolvent même si une rejette en interne.
    const dbRows: string[] = [];
    const sendOne = async (id: string) => {
      try {
        if (id === "fail") throw new Error("simulated");
        dbRows.push(`OK-${id}`);
      } catch {
        dbRows.push(`FAILED-${id}`);
      }
    };
    const settled = await Promise.allSettled(
      ["a", "fail", "c"].map((id) => sendOne(id))
    );
    expect(settled.every((s) => s.status === "fulfilled")).toBe(true);
    expect(dbRows).toEqual(["OK-a", "FAILED-fail", "OK-c"]);
  });
});

// ─── Aggregation tests — réponse claire en cas d'envois partiels ─────────
describe("summarizeSendResults — résultat clair même en cas d'échec partiel", () => {
  it("compte correctement sent / failed / no_email", () => {
    const r = summarizeSendResults([
      { status: "sent" },
      { status: "sent" },
      { status: "failed" },
      { status: "no_email" },
      { status: "no_email" },
      { status: "no_email" },
    ]);
    expect(r).toEqual({ sent: 2, failed: 1, noEmail: 3, partial: true });
  });

  it("partial = false si tout est OK", () => {
    const r = summarizeSendResults([
      { status: "sent" },
      { status: "sent" },
      { status: "sent" },
    ]);
    expect(r.partial).toBe(false);
    expect(r.sent).toBe(3);
  });

  it("partial = false si tout est échec (cas total failure)", () => {
    const r = summarizeSendResults([
      { status: "failed" },
      { status: "failed" },
    ]);
    expect(r.partial).toBe(false);
    expect(r.failed).toBe(2);
  });

  it("partial = false sur tableau vide", () => {
    expect(summarizeSendResults([]).partial).toBe(false);
  });

  it("ignore le statut 'preview' (dry-run)", () => {
    const r = summarizeSendResults([
      { status: "preview" },
      { status: "preview" },
    ]);
    expect(r).toEqual({ sent: 0, failed: 0, noEmail: 0, partial: false });
  });
});
