jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    storeEmployee: { findMany: jest.fn() },
    managerAlert: { findMany: jest.fn() },
  },
}));

import { GET } from "@/app/api/alerts/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const getSession = getServerSession as jest.Mock;
const seFindMany = prisma.storeEmployee.findMany as jest.Mock;
const alertFindMany = prisma.managerAlert.findMany as jest.Mock;

const req = (qs: string) =>
  ({ url: `http://x/api/alerts${qs}` } as unknown as import("next/server").NextRequest);

beforeEach(() => {
  getSession.mockReset();
  seFindMany.mockReset();
  alertFindMany.mockReset().mockResolvedValue([]);
});

// Test d'autorisation AU NIVEAU ROUTE (non-régression M1 : périmètre magasin sur /api/alerts).

describe("GET /api/alerts — scoping magasin", () => {
  it("MANAGER demandant un magasin HORS périmètre → 403, aucune requête d'alertes", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "MANAGER", employeeId: "e1" } });
    seFindMany.mockResolvedValue([{ storeId: "s1" }]); // le manager n'a que s1
    const res = await GET(req("?storeId=s9"));
    expect(res.status).toBe(403);
    expect(alertFindMany).not.toHaveBeenCalled();
  });

  it("MANAGER demandant son propre magasin → 200, filtre sur ce magasin", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "MANAGER", employeeId: "e1" } });
    seFindMany.mockResolvedValue([{ storeId: "s1" }]);
    const res = await GET(req("?storeId=s1"));
    expect(res.status).toBe(200);
    expect(alertFindMany.mock.calls[0][0].where.storeId).toBe("s1");
  });

  it("MANAGER sans magasin précis → 200, restreint à son ensemble", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "MANAGER", employeeId: "e1" } });
    seFindMany.mockResolvedValue([{ storeId: "s1" }, { storeId: "s2" }]);
    const res = await GET(req(""));
    expect(res.status).toBe(200);
    expect(alertFindMany.mock.calls[0][0].where.storeId).toEqual({ in: ["s1", "s2"] });
  });

  it("ADMIN demandant n'importe quel magasin → 200, pas de restriction imposée", async () => {
    getSession.mockResolvedValue({ user: { id: "a1", role: "ADMIN", employeeId: null } });
    const res = await GET(req("?storeId=s9"));
    expect(res.status).toBe(200);
    expect(alertFindMany.mock.calls[0][0].where.storeId).toBe("s9");
    expect(seFindMany).not.toHaveBeenCalled(); // admin = pas de lookup de périmètre
  });
});
