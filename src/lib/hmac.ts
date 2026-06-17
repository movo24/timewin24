import { createHmac } from "crypto";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60_000; // 5 minutes — covers network latency + clock drift
const NONCE_EXPIRY_MS = 10 * 60_000;       // Keep nonces for 10min (> drift window to catch replays)

// In-memory nonce store (single-instance safe; for multi-instance use Redis)
const usedNonces = new Map<string, number>();

// Cleanup expired nonces every 2 minutes
const nonceCleanup = setInterval(() => {
  const now = Date.now();
  for (const [nonce, ts] of usedNonces) {
    if (now - ts > NONCE_EXPIRY_MS) usedNonces.delete(nonce);
  }
}, 2 * 60 * 1000);
// Ne pas maintenir l'event loop en vie (exit propre en test/CLI ; no-op dans le serveur long-vécu).
nonceCleanup.unref?.();

/**
 * Compute HMAC-SHA256 signature.
 * Payload: timestamp.nonce.body
 */
export function computeHmac(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  const payload = `${timestamp}.${nonce}.${body}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export interface HmacValidationResult {
  valid: boolean;
  error?: string;
  matchedIndex?: number; // index du secret qui a matché (0 = primaire, >0 = rollover)
}

/**
 * Validate HMAC signature from POS request headers.
 * Checks: presence, timestamp drift, nonce replay, signature match.
 */
export function validateHmac(
  headers: {
    timestamp: string | null;
    nonce: string | null;
    signature: string | null;
  },
  body: string,
  secret: string | string[], // string[] = plusieurs secrets valides pendant une rotation
): HmacValidationResult {
  const { timestamp, nonce, signature } = headers;

  if (!timestamp || !nonce || !signature) {
    return { valid: false, error: "Missing HMAC headers (X-POS-Timestamp, X-POS-Nonce, X-POS-Signature)" };
  }

  // Timestamp drift check
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { valid: false, error: "Invalid timestamp" };
  }
  const drift = Math.abs(Date.now() - ts);
  if (drift > MAX_TIMESTAMP_DRIFT_MS) {
    return { valid: false, error: `Timestamp expired (drift: ${Math.round(drift / 1000)}s, max: ${MAX_TIMESTAMP_DRIFT_MS / 1000}s)` };
  }

  // Nonce replay check
  if (usedNonces.has(nonce)) {
    return { valid: false, error: "Nonce already used (replay detected)" };
  }

  // Signature verification (timing-safe comparison). Accepte N'IMPORTE QUEL secret candidat
  // → un secret peut être tourné sans coupure du webhook (ancien + nouveau valides au cutover).
  const candidates = Array.isArray(secret) ? secret : [secret];
  const matchedIndex = candidates.findIndex((s) => {
    const expected = computeHmac(s, timestamp, nonce, body);
    if (expected.length !== signature.length) return false;
    // Comparaison constant-time sur toute la longueur
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  });
  if (matchedIndex === -1) {
    return { valid: false, error: "Invalid signature" };
  }

  // Mark nonce as used
  usedNonces.set(nonce, Date.now());

  return { valid: true, matchedIndex };
}
