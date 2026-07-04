import {
  scoreContractualTarget,
  scorePriority,
  scorePreferredStore,
  scoreCostEfficiency,
  scoreFairDistribution,
  scoreReliabilityMatch,
  scoreStoreImportanceMatch,
} from "@/lib/solver/scoring";

// M116 — couverture du scoring du solveur (pur, types only).

describe("scorePriority (CDI > CDD > extra)", () => {
  it("mappe priorité → bonus", () => {
    expect(scorePriority(1)).toBe(1.0);
    expect(scorePriority(2)).toBe(0.5);
    expect(scorePriority(3)).toBe(0.2);
    expect(scorePriority(9)).toBe(0.2);
  });
});

describe("scorePreferredStore", () => {
  it("neutre si pas de préférence", () => {
    expect(scorePreferredStore(null, "s1")).toBe(0.5);
  });
  it("bonus si magasin préféré, malus sinon", () => {
    expect(scorePreferredStore("s1", "s1")).toBe(1.0);
    expect(scorePreferredStore("s2", "s1")).toBe(0.2);
  });
});

describe("scoreCostEfficiency (moins cher = mieux)", () => {
  it("neutre si coût null ou plage nulle", () => {
    expect(scoreCostEfficiency(null, 10, 20)).toBe(0.5);
    expect(scoreCostEfficiency(15, 5, 5)).toBe(0.5);
  });
  it("normalise entre min et max", () => {
    expect(scoreCostEfficiency(10, 10, 20)).toBe(1); // le moins cher
    expect(scoreCostEfficiency(20, 10, 20)).toBe(0); // le plus cher
    expect(scoreCostEfficiency(15, 10, 20)).toBe(0.5);
  });
});

describe("scoreContractualTarget (proximité de l'objectif hebdo)", () => {
  it("neutre si pas d'objectif", () => {
    expect(scoreContractualTarget(0, 8, null)).toBe(0.5);
    expect(scoreContractualTarget(0, 8, 0)).toBe(0.5);
  });
  it("sous l'objectif : proportion du gap comblé", () => {
    expect(scoreContractualTarget(10, 8, 35)).toBeCloseTo(8 / 25, 5);
    expect(scoreContractualTarget(27, 8, 35)).toBe(1); // 27+8=35 comble exactement le gap
  });
  it("au-dessus de l'objectif : score réduit", () => {
    expect(scoreContractualTarget(38, 8, 35)).toBeCloseTo(1 - 11 / 35, 5);
  });
});

describe("scoreFairDistribution (équité = favorise les sous-chargés)", () => {
  it("max quand l'employé est à 0h", () => {
    expect(scoreFairDistribution(0, 35, 30)).toBe(1);
  });
  it("0 quand déjà à l'objectif", () => {
    expect(scoreFairDistribution(35, 35, 30)).toBe(0);
  });
  it("utilise la moyenne du pool si pas d'objectif", () => {
    expect(scoreFairDistribution(10, null, 40)).toBe(0.75); // 30/40
  });
});

describe("scoreReliabilityMatch (Manager Brain)", () => {
  it("profil A à l'ouverture → boosté (clamp 1)", () => {
    expect(scoreReliabilityMatch(90, "A", "OUVERTURE", 2)).toBe(1.0); // 0.9*1.3 clamp
  });
  it("profil C à l'ouverture → pénalisé", () => {
    expect(scoreReliabilityMatch(40, "C", "OUVERTURE", 2)).toBeCloseTo(0.12, 5); // 0.4*0.3
  });
  it("profil C en milieu de journée → léger bonus", () => {
    expect(scoreReliabilityMatch(50, "C", "MILIEU", 2)).toBeCloseTo(0.55, 5); // 0.5*1.1
  });
  it("sinon = score normalisé (défaut 50 si null)", () => {
    expect(scoreReliabilityMatch(60, "B", "MILIEU", 2)).toBeCloseTo(0.6, 5);
    expect(scoreReliabilityMatch(null, "A", "MILIEU", 2)).toBe(0.5);
  });
});

describe("scoreStoreImportanceMatch (forts → magasins importants)", () => {
  it("magasin critique (importance 1) : palier selon fiabilité", () => {
    expect(scoreStoreImportanceMatch(80, 1)).toBe(1.0);
    expect(scoreStoreImportanceMatch(60, 1)).toBe(0.5);
    expect(scoreStoreImportanceMatch(40, 1)).toBe(0.1);
  });
  it("magasin secondaire (importance 3) : neutre-bon pour tous", () => {
    expect(scoreStoreImportanceMatch(50, 3)).toBe(0.7);
  });
  it("magasin standard : score/100 (défaut 50 si null)", () => {
    expect(scoreStoreImportanceMatch(50, 2)).toBe(0.5);
    expect(scoreStoreImportanceMatch(null, 2)).toBe(0.5);
  });
});
