jest.mock("@/lib/prisma", () => ({
  prisma: {
    storeEmployee: { findFirst: jest.fn() },
    connectedApp: { findUnique: jest.fn() },
    posStoreLink: { findMany: jest.fn() },
  },
}));

import { canAccessEmployee } from "@/lib/api-helpers";
import { posKeyStoreIds, assertPosStoreAccess } from "@/lib/pos-auth";
import { prisma } from "@/lib/prisma";

const m = {
  seFind: prisma.storeEmployee.findFirst as jest.Mock,
  appFind: prisma.connectedApp.findUnique as jest.Mock,
  linkFind: prisma.posStoreLink.findMany as jest.Mock,
};
beforeEach(() => Object.values(m).forEach((fn) => fn.mockReset()));

// Sécurité multi-magasin — décision d'accès (helpers DB), Prisma mocké.

describe("canAccessEmployee", () => {
  it("admin (null) : toujours autorisé, sans requête DB", async () => {
    expect(await canAccessEmployee("e1", null)).toBe(true);
    expect(m.seFind).not.toHaveBeenCalled();
  });
  it("aucun magasin ([]) : toujours refusé, sans requête DB", async () => {
    expect(await canAccessEmployee("e1", [])).toBe(false);
    expect(m.seFind).not.toHaveBeenCalled();
  });
  it("manager : autorisé si l'employé partage un magasin", async () => {
    m.seFind.mockResolvedValue({ storeId: "s1" });
    expect(await canAccessEmployee("e1", ["s1", "s2"])).toBe(true);
    expect(m.seFind.mock.calls[0][0].where).toMatchObject({ employeeId: "e1", storeId: { in: ["s1", "s2"] } });
  });
  it("manager : refusé si aucun magasin commun", async () => {
    m.seFind.mockResolvedValue(null);
    expect(await canAccessEmployee("e9", ["s1"])).toBe(false);
  });
});

describe("posKeyStoreIds", () => {
  it("clé ConnectedApp : son unique magasin", async () => {
    m.appFind.mockResolvedValue({ storeId: "s1" });
    expect(await posKeyStoreIds("key1")).toEqual(["s1"]);
    expect(m.linkFind).not.toHaveBeenCalled();
  });
  it("clé PosProvider : ses magasins liés", async () => {
    m.appFind.mockResolvedValue(null);
    m.linkFind.mockResolvedValue([{ storeId: "s1" }, { storeId: "s2" }]);
    expect(await posKeyStoreIds("prov1")).toEqual(["s1", "s2"]);
  });
  it("clé sans lien : aucun magasin", async () => {
    m.appFind.mockResolvedValue(null);
    m.linkFind.mockResolvedValue([]);
    expect(await posKeyStoreIds("orphan")).toEqual([]);
  });
});

describe("assertPosStoreAccess", () => {
  const reqWithKey = (keyId: string | null) =>
    ({ headers: { get: (h: string) => (h === "x-pos-key-id" ? keyId : null) } } as unknown as import("next/server").NextRequest);

  it("autorise un magasin dans le périmètre de la clé (null)", async () => {
    m.appFind.mockResolvedValue({ storeId: "s1" });
    expect(await assertPosStoreAccess(reqWithKey("key1"), "s1")).toBeNull();
  });
  it("refuse (403) un magasin hors périmètre", async () => {
    m.appFind.mockResolvedValue({ storeId: "s1" });
    const res = await assertPosStoreAccess(reqWithKey("key1"), "s9");
    expect(res?.status).toBe(403);
  });
  it("401 si aucune clé fournie", async () => {
    const res = await assertPosStoreAccess(reqWithKey(null), "s1");
    expect(res?.status).toBe(401);
  });
});
