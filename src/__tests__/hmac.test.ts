import { computeHmac, validateHmac } from "@/lib/hmac";

// M116 / M008 — auth HMAC du webhook POS (signature, drift, anti-replay).

const SECRET = "test-secret";
const BODY = '{"event":"sale"}';

describe("computeHmac", () => {
  it("est déterministe pour les mêmes entrées", () => {
    const a = computeHmac(SECRET, "1000", "n1", BODY);
    const b = computeHmac(SECRET, "1000", "n1", BODY);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });
  it("change si un composant change", () => {
    const base = computeHmac(SECRET, "1000", "n1", BODY);
    expect(computeHmac("other", "1000", "n1", BODY)).not.toBe(base);
    expect(computeHmac(SECRET, "1001", "n1", BODY)).not.toBe(base);
    expect(computeHmac(SECRET, "1000", "n2", BODY)).not.toBe(base);
    expect(computeHmac(SECRET, "1000", "n1", "{}")).not.toBe(base);
  });
});

describe("validateHmac", () => {
  const fresh = (nonce: string) => {
    const timestamp = Date.now().toString();
    const signature = computeHmac(SECRET, timestamp, nonce, BODY);
    return { timestamp, nonce, signature };
  };

  it("refuse des en-têtes manquants", () => {
    expect(validateHmac({ timestamp: null, nonce: "n", signature: "s" }, BODY, SECRET).valid).toBe(false);
    expect(validateHmac({ timestamp: "1", nonce: null, signature: "s" }, BODY, SECRET).valid).toBe(false);
    expect(validateHmac({ timestamp: "1", nonce: "n", signature: null }, BODY, SECRET).valid).toBe(false);
  });

  it("refuse un timestamp non numérique", () => {
    const r = validateHmac({ timestamp: "abc", nonce: "n", signature: "s" }, BODY, SECRET);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/timestamp/i);
  });

  it("refuse un timestamp hors fenêtre (drift > 5min)", () => {
    const old = (Date.now() - 10 * 60_000).toString();
    const signature = computeHmac(SECRET, old, "n-drift", BODY);
    const r = validateHmac({ timestamp: old, nonce: "n-drift", signature }, BODY, SECRET);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/expired|drift/i);
  });

  it("accepte une signature valide et récente", () => {
    const r = validateHmac(fresh("n-ok"), BODY, SECRET);
    expect(r.valid).toBe(true);
  });

  it("détecte le rejeu (nonce déjà utilisé)", () => {
    const h = fresh("n-replay");
    expect(validateHmac(h, BODY, SECRET).valid).toBe(true); // 1ère fois
    const r2 = validateHmac(h, BODY, SECRET); // rejeu
    expect(r2.valid).toBe(false);
    expect(r2.error).toMatch(/replay|nonce/i);
  });

  it("refuse une signature incorrecte", () => {
    const timestamp = Date.now().toString();
    const r = validateHmac(
      { timestamp, nonce: "n-bad", signature: "deadbeef".repeat(8) },
      BODY,
      SECRET
    );
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/signature/i);
  });

  it("refuse une bonne signature calculée avec un autre secret", () => {
    const timestamp = Date.now().toString();
    const signature = computeHmac("wrong-secret", timestamp, "n-secret", BODY);
    const r = validateHmac({ timestamp, nonce: "n-secret", signature }, BODY, SECRET);
    expect(r.valid).toBe(false);
  });
});
