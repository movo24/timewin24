jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    storeEmployee: { findMany: jest.fn(), findFirst: jest.fn() },
    employee: { findUnique: jest.fn() },
    store: { findUnique: jest.fn() },
    shift: { findFirst: jest.fn() },
    clockIn: { create: jest.fn() },
  },
}));

import { POST } from "@/app/api/attendance/clock-in/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const getSession = getServerSession as jest.Mock;
const p = {
  seMany: prisma.storeEmployee.findMany as jest.Mock,
  seFirst: prisma.storeEmployee.findFirst as jest.Mock,
  empFind: prisma.employee.findUnique as jest.Mock,
  storeFind: prisma.store.findUnique as jest.Mock,
  shiftFind: prisma.shift.findFirst as jest.Mock,
  clockCreate: prisma.clockIn.create as jest.Mock,
};
const req = (body: object) => ({ json: async () => body } as unknown as import("next/server").NextRequest);

beforeEach(() => Object.values(p).forEach((fn) => fn.mockReset()));

// Non-régression C3 : anti-spoofing du pointage.

describe("POST /api/attendance/clock-in — anti-spoofing", () => {
  it("EMPLOYÉ pointant pour UN AUTRE employé (hors périmètre) → 403", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "EMPLOYEE", employeeId: "e1" } });
    p.seMany.mockResolvedValue([{ storeId: "s1" }]); // périmètre de e1 = s1
    p.seFirst.mockResolvedValue(null); // e2 n'est pas dans s1
    const res = await POST(req({ employeeId: "e2", storeId: "s1" }));
    expect(res.status).toBe(403);
    expect(p.clockCreate).not.toHaveBeenCalled();
  });

  it("EMPLOYÉ pointant dans un magasin qui n'est pas le sien → 403", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "EMPLOYEE", employeeId: "e1" } });
    p.seMany.mockResolvedValue([{ storeId: "s1" }]);
    const res = await POST(req({ employeeId: "e1", storeId: "s9" }));
    expect(res.status).toBe(403);
    expect(p.clockCreate).not.toHaveBeenCalled();
  });

  it("EMPLOYÉ pointant pour LUI-MÊME dans son magasin → autorisé (201)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "EMPLOYEE", employeeId: "e1" } });
    p.seMany.mockResolvedValue([{ storeId: "s1" }]);
    p.empFind.mockResolvedValue({ id: "e1", active: true, accessStatus: "ACTIVE" });
    p.storeFind.mockResolvedValue({ id: "s1", latitude: null, longitude: null });
    p.shiftFind.mockResolvedValue(null);
    p.clockCreate.mockResolvedValue({ id: "c1", clockInAt: new Date("2026-06-22T09:00:00Z") });
    const res = await POST(req({ employeeId: "e1", storeId: "s1" }));
    expect(res.status).toBe(201);
    expect(p.clockCreate).toHaveBeenCalledTimes(1);
  });

  it("clé service (POS) → bypass du contrôle de périmètre (201)", async () => {
    getSession.mockResolvedValue({ user: { id: "service:k1", role: "ADMIN", employeeId: null } });
    p.empFind.mockResolvedValue({ id: "e2", active: true, accessStatus: "ACTIVE" });
    p.storeFind.mockResolvedValue({ id: "s2", latitude: null, longitude: null });
    p.shiftFind.mockResolvedValue(null);
    p.clockCreate.mockResolvedValue({ id: "c2", clockInAt: new Date("2026-06-22T09:00:00Z") });
    const res = await POST(req({ employeeId: "e2", storeId: "s2" }));
    expect(res.status).toBe(201);
    expect(p.seMany).not.toHaveBeenCalled(); // pas de lookup de périmètre pour une clé service
  });
});
