import { scoreConfidence } from "@/lib/ai-engine/nlp/confidence";
import type { ParsedIntent, ActionType } from "@/lib/manager-ia/types";

// M116 / AI Engine — score de confiance d'un ParsedIntent (parser
// deterministe). Sous le seuil, le pipeline bascule vers Gemini : la fiabilite
// de ce score conditionne donc le routage NLP.

const intent = (o: Partial<ParsedIntent> & { action: ActionType }): ParsedIntent => ({
  employeeName: null, storeName: null, dateExpr: null, targetDateExpr: null,
  timeSlot: null, startTimeExpr: null, endTimeExpr: null, duration: null,
  rawCommand: "", ...o,
});

const ctx = {
  knownEmployees: [{ firstName: "Alice", lastName: "Martin" }],
  knownStores: ["Wesley Gare"],
};

describe("scoreConfidence", () => {
  it("CREATE complet et reconnu -> haute confiance, aucun motif", () => {
    const out = scoreConfidence(
      intent({ action: "CREATE", employeeName: "Alice", storeName: "Wesley Gare",
        dateExpr: "weekday:2", startTimeExpr: "09:00", endTimeExpr: "17:00" }),
      ctx
    );
    expect(out.actionConfidence).toBe(0.9);
    expect(out.entityConfidence).toBe(1);
    expect(out.dateConfidence).toBe(1);
    expect(out.timeConfidence).toBe(1);
    expect(out.overall).toBeGreaterThan(0.9);
    expect(out.reasons).toHaveLength(0);
  });

  it("ANALYZE (sans entite/date/horaire requis) -> ~0.99", () => {
    const out = scoreConfidence(intent({ action: "ANALYZE" }));
    // 0.95*0.25 + 1*0.35 + 1*0.25 + 1*0.15 = 0.9875 -> 0.99
    expect(out.overall).toBe(0.99);
    expect(out.reasons).toHaveLength(0);
  });

  it("CREATE sans employe -> entityConfidence chute, motif present", () => {
    const out = scoreConfidence(intent({ action: "CREATE", dateExpr: "weekday:2", startTimeExpr: "09:00" }), ctx);
    expect(out.entityConfidence).toBe(0.3);
    expect(out.reasons).toContain("Employé requis mais non trouvé");
  });

  it("employe non reconnu dans le contexte -> penalite 0.5", () => {
    const out = scoreConfidence(
      intent({ action: "CREATE", employeeName: "Zoé", dateExpr: "weekday:2", startTimeExpr: "09:00" }),
      ctx
    );
    expect(out.entityConfidence).toBe(0.5);
    expect(out.reasons.some((r) => r.includes("non reconnu"))).toBe(true);
  });

  it("magasin non reconnu -> penalite entite 0.6", () => {
    const out = scoreConfidence(
      intent({ action: "ANALYZE", storeName: "Magasin Inconnu" }),
      ctx
    );
    expect(out.entityConfidence).toBe(0.6);
    expect(out.reasons.some((r) => r.includes("Magasin"))).toBe(true);
  });

  it("date requise manquante -> dateConfidence 0.4", () => {
    const out = scoreConfidence(intent({ action: "DELETE", employeeName: "Alice" }), ctx);
    expect(out.dateConfidence).toBe(0.4);
    expect(out.reasons).toContain("Date requise mais non trouvée");
  });

  it("creneau nomme sans heure explicite -> timeConfidence 0.8", () => {
    const out = scoreConfidence(
      intent({ action: "CREATE", employeeName: "Alice", dateExpr: "weekday:2", timeSlot: "matin" }),
      ctx
    );
    expect(out.timeConfidence).toBe(0.8);
  });

  it("horaire requis totalement absent -> timeConfidence 0.5", () => {
    const out = scoreConfidence(
      intent({ action: "CREATE", employeeName: "Alice", dateExpr: "weekday:2" }),
      ctx
    );
    expect(out.timeConfidence).toBe(0.5);
    expect(out.reasons).toContain("Horaire requis mais non trouvé");
  });
});
