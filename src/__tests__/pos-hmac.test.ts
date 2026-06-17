import { computeHmac, validateHmac } from "@/lib/hmac";

// Couvre le chemin HMAC du webhook POS, en particulier la rotation multi-secret
// (validateHmac accepte string | string[]). Aucun test n'existait sur ce module.

const BODY = JSON.stringify({ eventType: "sale.completed", data: { revenue: 10 } });
const tsNow = () => Date.now().toString();
const sign = (secret: string, ts: string, nonce: string, body: string) =>
  computeHmac(secret, ts, nonce, body);

describe("validateHmac — rotation multi-secret (POS webhook)", () => {
  it("valide une signature avec un secret unique (string, rétrocompat)", () => {
    const ts = tsNow();
    const nonce = "n-single";
    const sig = sign("s_old", ts, nonce, BODY);
    const r = validateHmac({ timestamp: ts, nonce, signature: sig }, BODY, "s_old");
    expect(r.valid).toBe(true);
    expect(r.matchedIndex).toBe(0);
  });

  it("rejette une mauvaise signature", () => {
    const r = validateHmac(
      { timestamp: tsNow(), nonce: "n-bad", signature: "deadbeef" },
      BODY,
      "s_old",
    );
    expect(r.valid).toBe(false);
    expect(r.error).toBe("Invalid signature");
  });

  it("accepte le NOUVEAU secret pendant la rotation (matchedIndex = rollover)", () => {
    const ts = tsNow();
    const nonce = "n-new";
    const sig = sign("s_new", ts, nonce, BODY); // AddX signe avec NEW
    const r = validateHmac({ timestamp: ts, nonce, signature: sig }, BODY, ["s_old", "s_new"]);
    expect(r.valid).toBe(true);
    expect(r.matchedIndex).toBe(1);
  });

  it("accepte encore l'ANCIEN secret pendant la fenêtre de bascule", () => {
    const ts = tsNow();
    const nonce = "n-old-window";
    const sig = sign("s_old", ts, nonce, BODY);
    const r = validateHmac({ timestamp: ts, nonce, signature: sig }, BODY, ["s_old", "s_new"]);
    expect(r.valid).toBe(true);
    expect(r.matchedIndex).toBe(0);
  });

  it("rejette si aucun secret candidat ne matche", () => {
    const ts = tsNow();
    const nonce = "n-none";
    const sig = sign("s_other", ts, nonce, BODY);
    const r = validateHmac({ timestamp: ts, nonce, signature: sig }, BODY, ["s_old", "s_new"]);
    expect(r.valid).toBe(false);
  });

  it("rejette les headers HMAC manquants", () => {
    const r = validateHmac({ timestamp: null, nonce: null, signature: null }, BODY, "s_old");
    expect(r.valid).toBe(false);
  });

  it("rejette un timestamp hors fenêtre (drift > 5 min)", () => {
    const ts = (Date.now() - 6 * 60_000).toString();
    const nonce = "n-drift";
    const sig = sign("s_old", ts, nonce, BODY);
    const r = validateHmac({ timestamp: ts, nonce, signature: sig }, BODY, "s_old");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/expired/i);
  });

  it("rejette un nonce rejoué (replay)", () => {
    const ts = tsNow();
    const nonce = "n-replay";
    const sig = sign("s_old", ts, nonce, BODY);
    expect(validateHmac({ timestamp: ts, nonce, signature: sig }, BODY, "s_old").valid).toBe(true);
    const r2 = validateHmac({ timestamp: ts, nonce, signature: sig }, BODY, "s_old");
    expect(r2.valid).toBe(false);
    expect(r2.error).toMatch(/replay/i);
  });
});
