import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { validateHmac } from "./hmac";
import { errorResponse } from "./api-helpers";

/**
 * Validate POS authentication — supports both HMAC (preferred) and legacy X-POS-Secret.
 *
 * HMAC headers: X-POS-Timestamp, X-POS-Nonce, X-POS-Signature, X-POS-Key-Id
 * Legacy header: X-POS-Secret (direct secret comparison — will be deprecated)
 *
 * Returns null on success, NextResponse error on failure.
 */
export async function validatePosAuth(req: NextRequest, body?: string) {
  const hmacSignature = req.headers.get("x-pos-signature");

  if (hmacSignature) {
    return validatePosHmac(req, body || "");
  }

  // Legacy: direct secret
  const secret = req.headers.get("x-pos-secret");
  if (!secret) {
    return errorResponse("Authentification POS requise (HMAC ou X-POS-Secret)", 401);
  }

  const app = await prisma.connectedApp.findUnique({ where: { webhookSecret: secret } });
  const provider = !app
    ? await prisma.posProvider.findUnique({ where: { webhookSecret: secret } })
    : null;

  if (!app && !provider) {
    return errorResponse("Secret invalide", 401);
  }

  return null; // success
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
