import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// M116 / securite — limiteur de debit en memoire (anti brute-force login,
// protection des routes API/webhook). Fenetre glissante par cle.

const cfg = { limit: 3, windowMs: 60_000 };
// cle unique par test pour isoler l'etat du store module-level
let n = 0;
const freshKey = () => `k-${Date.now()}-${n++}`;

describe("checkRateLimit", () => {
  it("autorise dans la limite et decremente remaining", () => {
    const key = freshKey();
    expect(checkRateLimit(key, cfg)).toMatchObject({ allowed: true, remaining: 2 });
    expect(checkRateLimit(key, cfg)).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkRateLimit(key, cfg)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("bloque au-dela de la limite avec retryAfterMs > 0", () => {
    const key = freshKey();
    checkRateLimit(key, cfg);
    checkRateLimit(key, cfg);
    checkRateLimit(key, cfg);
    const out = checkRateLimit(key, cfg); // 4e -> bloque
    expect(out.allowed).toBe(false);
    expect(out.remaining).toBe(0);
    expect(out.retryAfterMs).toBeGreaterThan(0);
    expect(out.retryAfterMs).toBeLessThanOrEqual(cfg.windowMs);
  });

  it("isole les cles entre elles", () => {
    const a = freshKey(), b = freshKey();
    checkRateLimit(a, cfg);
    checkRateLimit(a, cfg);
    checkRateLimit(a, cfg);
    expect(checkRateLimit(a, cfg).allowed).toBe(false); // a sature
    expect(checkRateLimit(b, cfg).allowed).toBe(true); // b intact
  });

  it("reouvre la fenetre une fois resetAt passe", () => {
    jest.useFakeTimers();
    try {
      const key = freshKey();
      checkRateLimit(key, cfg);
      checkRateLimit(key, cfg);
      checkRateLimit(key, cfg);
      expect(checkRateLimit(key, cfg).allowed).toBe(false);
      jest.advanceTimersByTime(cfg.windowMs + 1); // fenetre expiree
      const out = checkRateLimit(key, cfg);
      expect(out.allowed).toBe(true);
      expect(out.remaining).toBe(cfg.limit - 1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("getClientIp", () => {
  const reqWith = (headers: Record<string, string>) =>
    ({ headers: { get: (n: string) => headers[n.toLowerCase()] ?? null } } as unknown as Request);

  it("prend la premiere IP de x-forwarded-for", () => {
    expect(getClientIp(reqWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });
  it("retombe sur x-real-ip", () => {
    expect(getClientIp(reqWith({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });
  it("retourne 'unknown' sans en-tete", () => {
    expect(getClientIp(reqWith({}))).toBe("unknown");
  });
});
