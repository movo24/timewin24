// Mock du singleton Prisma : permet de charger le module reliability-score
// (qui importe `@/lib/prisma`) sans connexion DB. Sert de patron reutilisable
// pour tester la logique pure co-localisee avec des modules DB-bound.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { deriveProfileCategory } from "@/lib/reliability-score";

// M116 / Manager Brain — categorisation de profil a partir du score de
// fiabilite (0-100). Pilote le placement : A peut ouvrir seul / magasins
// difficiles, C ne doit pas etre seul sur creneau sensible.

describe("deriveProfileCategory", () => {
  it("score >= 75 -> A (tres fiable)", () => {
    expect(deriveProfileCategory(75)).toBe("A");
    expect(deriveProfileCategory(100)).toBe("A");
  });

  it("50 <= score < 75 -> B (fiable moyen)", () => {
    expect(deriveProfileCategory(50)).toBe("B");
    expect(deriveProfileCategory(74)).toBe("B");
    expect(deriveProfileCategory(74.9)).toBe("B");
  });

  it("score < 50 -> C (fragile)", () => {
    expect(deriveProfileCategory(49)).toBe("C");
    expect(deriveProfileCategory(0)).toBe("C");
  });

  it("respecte les bornes exactes des seuils", () => {
    // 75 bascule en A, 74 reste B ; 50 bascule en B, 49 reste C
    expect(deriveProfileCategory(74)).toBe("B");
    expect(deriveProfileCategory(75)).toBe("A");
    expect(deriveProfileCategory(49)).toBe("C");
    expect(deriveProfileCategory(50)).toBe("B");
  });
});
