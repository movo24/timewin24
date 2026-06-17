import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { validateHmac } from "./hmac";
import { errorResponse } from "./api-helpers";

/**
 * Validate POS authentication — HMAC SHA-256 only.
 *
 * Required headers: X-POS-Timestamp, X-POS-Nonce, X-POS-Signature, X-POS-Key-Id
 * Legacy X-POS-Secret header is no longer accepted.
 *
 * Returns null on success, NextResponse error on failure.
 */
export async function validatePosAuth(req: NextRequest, body?: string) {
  const hmacSignature = req.headers.get("x-pos-signature");

  if (!hmacSignature) {
    return errorResponse(
      "Authentification HMAC requise (X-POS-Signature, X-POS-Timestamp, X-POS-Nonce, X-POS-Key-Id)",
      401
    );
  }

  return validatePosHmac(req, body || "");
}

async function validatePosHmac(req: NextRequest, body: string) {
  const timestamp = req.headers.get("x-pos-timestamp");
  const nonce = req.headers.get("x-pos-nonce");
  const signature = req.headers.get("x-pos-signature");
  const keyId = req.headers.get("x-pos-key-id");

  if (!keyId) {
    return errorResponse("X-POS-Key-Id requis pour HMAC", 401);
  }

  // Look up the secret by key ID (connectedApp or posProvider)
  const app = await prisma.connectedApp.findUnique({
    where: { id: keyId },
    select: { webhookSecret: true },
  });
  const provider = !app
    ? await prisma.posProvider.findUnique({
        where: { id: keyId },
        select: { webhookSecret: true },
      })
    : null;

  const secret = app?.webhookSecret || provider?.webhookSecret;
  if (!secret) {
    return errorResponse("Key ID invalide", 401);
  }

  // Rotation zéro-coupure : accepte aussi le(s) secret(s) transitoires de
  // POS_WEBHOOK_SECRET_ROLLOVER (séparés par virgule). Posé pendant la fenêtre de bascule
  // pour que l'ancien ET le nouveau secret valident ; retiré une fois CAISSE/AddX basculé.
  // Env vide → comportement identique à avant ([secret] seul).
  const rollover = (process.env.POS_WEBHOOK_SECRET_ROLLOVER || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const result = validateHmac(
    { timestamp, nonce, signature },
    body,
    [secret, ...rollover],
  );
  if (!result.valid) {
    return errorResponse(result.error || "HMAC invalide", 401);
  }

  // Monitoring de rotation : un match sur index > 0 = secret de rollover utilisé,
  // donc cutover en cours. Surveiller ces logs pour confirmer le passage au NOUVEAU secret.
  if ((result.matchedIndex ?? 0) > 0) {
    console.warn(
      `[pos-auth] webhook key=${keyId} validé via secret ROLLOVER #${result.matchedIndex} — rotation en cours`,
    );
  }

  return null; // success
}
