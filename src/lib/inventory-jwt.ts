import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

/**
 * Résout le secret de signature des tokens inventaire.
 * Préfère INVENTORY_JWT_SECRET (dédié), sinon retombe sur NEXTAUTH_SECRET.
 * Throw si aucun n'est défini — plus de fallback en dur prévisible.
 * Évaluation paresseuse pour ne pas casser le build si l'env est absent au build-time.
 */
function getSecret(): Uint8Array {
  const value = process.env.INVENTORY_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error(
      "INVENTORY_JWT_SECRET (ou NEXTAUTH_SECRET) doit être défini pour les tokens inventaire"
    );
  }
  return new TextEncoder().encode(value);
}

export interface InventoryTokenPayload {
  employeeId: string;
  storeId: string;
  employeeName: string;
  storeName: string;
  role: string;
}

export async function signInventoryToken(
  payload: InventoryTokenPayload
): Promise<string> {
  return new SignJWT({ ...payload, scope: "inventory" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifyInventoryToken(
  req: NextRequest
): Promise<InventoryTokenPayload | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.scope !== "inventory") return null;
    return payload as unknown as InventoryTokenPayload;
  } catch {
    return null;
  }
}
