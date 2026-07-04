import type { NextRequest } from "next/server";
import {
  signInventoryToken,
  verifyInventoryToken,
  type InventoryTokenPayload,
} from "@/lib/inventory-jwt";

// M116 / M009 — JWT session inventaire (signature HS256, scope, anti-forge).

const PAYLOAD: InventoryTokenPayload = {
  employeeId: "e1", storeId: "s1", employeeName: "Alice", storeName: "Wesley", role: "cashier",
};

const reqWith = (auth: string | null) =>
  ({ headers: { get: (n: string) => (n === "authorization" ? auth : null) } } as unknown as NextRequest);

beforeAll(() => {
  process.env.INVENTORY_JWT_SECRET = "test-inventory-secret-please-change";
});

describe("inventory JWT", () => {
  it("signe puis vérifie un token (round-trip)", async () => {
    const token = await signInventoryToken(PAYLOAD);
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
    const out = await verifyInventoryToken(reqWith(`Bearer ${token}`));
    expect(out).not.toBeNull();
    expect(out?.employeeId).toBe("e1");
    expect(out?.storeId).toBe("s1");
    expect(out?.role).toBe("cashier");
  });

  it("rejette l'absence d'en-tête Authorization", async () => {
    expect(await verifyInventoryToken(reqWith(null))).toBeNull();
  });

  it("rejette un schéma non-Bearer", async () => {
    const token = await signInventoryToken(PAYLOAD);
    expect(await verifyInventoryToken(reqWith(token))).toBeNull(); // pas de "Bearer "
  });

  it("rejette un token falsifié", async () => {
    const token = await signInventoryToken(PAYLOAD);
    const tampered = token.slice(0, -3) + "abc";
    expect(await verifyInventoryToken(reqWith(`Bearer ${tampered}`))).toBeNull();
  });

  it("rejette un token signé avec un autre secret (anti-forge)", async () => {
    const token = await signInventoryToken(PAYLOAD);
    process.env.INVENTORY_JWT_SECRET = "un-autre-secret-attaquant";
    const out = await verifyInventoryToken(reqWith(`Bearer ${token}`));
    process.env.INVENTORY_JWT_SECRET = "test-inventory-secret-please-change"; // restore
    expect(out).toBeNull();
  });
});
