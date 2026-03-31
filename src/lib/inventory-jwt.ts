import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "inventory-secret-fallback"
);

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
    .sign(SECRET);
}

export async function verifyInventoryToken(
  req: NextRequest
): Promise<InventoryTokenPayload | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.scope !== "inventory") return null;
    return payload as unknown as InventoryTokenPayload;
  } catch {
    return null;
  }
}
