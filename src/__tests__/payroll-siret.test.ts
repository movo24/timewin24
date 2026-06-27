import { isValidSiren, isValidSiret, sirenFromSiret, normalizeDigits } from "@/lib/payroll/siret";

// Paie / Étage 2 — validation des identifiants SIREN/SIRET (cle de Luhn).
// Fixtures = exemples canoniques INSEE.

describe("isValidSiren", () => {
  it("accepte un SIREN valide (9 chiffres + Luhn)", () => {
    expect(isValidSiren("732829320")).toBe(true);
  });
  it("tolere les espaces de saisie", () => {
    expect(isValidSiren("732 829 320")).toBe(true);
  });
  it("refuse une cle de Luhn invalide", () => {
    expect(isValidSiren("123456789")).toBe(false);
  });
  it("refuse une longueur incorrecte", () => {
    expect(isValidSiren("73282932")).toBe(false); // 8 chiffres
    expect(isValidSiren("7328293200")).toBe(false); // 10 chiffres
  });
});

describe("isValidSiret", () => {
  it("accepte un SIRET valide (14 chiffres + Luhn)", () => {
    expect(isValidSiret("73282932000074")).toBe(true);
  });
  it("tolere la ponctuation", () => {
    expect(isValidSiret("732 829 320 00074")).toBe(true);
  });
  it("refuse une cle de Luhn invalide", () => {
    expect(isValidSiret("73282932000073")).toBe(false);
  });
  it("refuse une longueur incorrecte", () => {
    expect(isValidSiret("732829320")).toBe(false); // SIREN seul
  });
});

describe("sirenFromSiret", () => {
  it("extrait les 9 premiers chiffres d'un SIRET", () => {
    expect(sirenFromSiret("73282932000074")).toBe("732829320");
  });
  it("renvoie null si la longueur n'est pas 14", () => {
    expect(sirenFromSiret("732829320")).toBeNull();
  });
});

describe("normalizeDigits", () => {
  it("ne garde que les chiffres", () => {
    expect(normalizeDigits("73 282-932/000 074")).toBe("73282932000074");
  });
});
