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

  const result = validateHmac({ timestamp, nonce, signature }, body, secret);
  if (!result.valid) {
    return errorResponse(result.error || "HMAC invalide", 401);
  }

  return null; // success
}

/**
 * Magasins accessibles à une clé POS (scoping multi-magasin).
 *  - clé ConnectedApp → son unique `storeId` ;
 *  - clé PosProvider → les magasins liés via `PosStoreLink`.
 * Renvoie [] si la clé n'a aucun magasin lié.
 */
export async function posKeyStoreIds(keyId: string): Promise<string[]> {
  const app = await prisma.connectedApp.findUnique({
    where: { id: keyId },
    select: { storeId: true },
  });
  if (app?.storeId) return [app.storeId];

  const links = await prisma.posStoreLink.findMany({
    where: { providerId: keyId },
    select: { storeId: true },
  });
  return links.map((l) => l.storeId);
}

/**
 * Vérifie qu'une clé POS (via `X-POS-Key-Id`) a accès à `storeId`.
 * Renvoie une NextResponse 403 si hors périmètre, sinon null.
 * À appeler APRÈS `validatePosAuth` (la clé est déjà authentifiée).
 */
export async function assertPosStoreAccess(req: NextRequest, storeId: string) {
  const keyId = req.headers.get("x-pos-key-id");
  if (!keyId) return errorResponse("X-POS-Key-Id requis", 401);
  const allowed = await posKeyStoreIds(keyId);
  if (!allowed.includes(storeId)) {
    return errorResponse("Magasin hors du périmètre de cette clé POS", 403);
  }
  return null;
}

