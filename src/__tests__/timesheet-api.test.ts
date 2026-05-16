/**
 * Tests d'intégration API Timesheet — RBAC + validation Zod.
 *
 * Stratégie : mock Prisma + company-context + query.ts (jest.mock).
 * Aucune DB Neon, aucun réseau, aucun Docker. Tests rapides et
 * déterministes.
 *
 * Cible : sécuriser le module avant merge. Les tests ici valident le
 * produit SaaS (multi-tenant, RBAC), pas juste le moteur.
 *
 * Cas critiques couverts :
 *   - OWNER / ADMIN ne voient pas une autre company
 *   - MANAGER limité à ses stores
 *   - MANAGER ne voit pas un employé d'un autre magasin même company
 *   - EMPLOYEE limité à soi-même + money masking
 *   - /today refuse EMPLOYEE
 *   - Validation Zod (dates, range, calendrier)
 *   - includeAnomalies on/off
 *   - unassignedPlannedMinutes
 */

// ─── Mocks (doivent venir AVANT les imports des handlers) ───────────────────
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    employee: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/company-context", () => ({
  requireCompanyContext: jest.fn(),
  getCompanyScopedStoreIds: jest.fn(),
}));

jest.mock("@/lib/timesheet/query", () => ({
  fetchTimesheetShifts: jest.fn(() => Promise.resolve([])),
  fetchTimesheetClockIns: jest.fn(() => Promise.resolve([])),
  fetchApprovedAbsences: jest.fn(() => Promise.resolve([])),
  fetchEmployeesContext: jest.fn(() => Promise.resolve(new Map())),
  fetchStoresContext: jest.fn(() => Promise.resolve(new Map())),
}));

import { NextRequest } from "next/server";
import { GET as timesheetGET } from "@/app/api/timesheet/route";
import { GET as employeeGET } from "@/app/api/timesheet/employees/[id]/route";
import { GET as todayGET } from "@/app/api/timesheet/today/route";
import { prisma } from "@/lib/prisma";
import {
  requireCompanyContext,
  getCompanyScopedStoreIds,
} from "@/lib/company-context";
import {
  fetchTimesheetShifts,
  fetchTimesheetClockIns,
  fetchApprovedAbsences,
  fetchEmployeesContext,
  fetchStoresContext,
} from "@/lib/timesheet/query";

// ─── Helpers ────────────────────────────────────────────────────────────────

// CUIDs valides : format Zod = /^c[^\s-]{8,}$/i (starts with 'c', 8+ chars,
// no whitespace/dash). 25 chars total comme un vrai cuid v1.
const COMPANY_A = "ccompanyaaaaaaaaaaaaaaaaa";
const COMPANY_B = "ccompanybbbbbbbbbbbbbbbbb";
const STORE_A1 = "cstoreaaaaaaaaaaaaaaaaaa1";
const STORE_A2 = "cstoreaaaaaaaaaaaaaaaaaa2";
const STORE_B1 = "cstorebbbbbbbbbbbbbbbbbb1";
const USER_OWNER_A = "cuserownerAaaaaaaaaaaaaaa";
const USER_EMP_A1 = "cuserempaaaaaaaaaaaaaaaa1";
const EMP_A1 = "cempaaaaaaaaaaaaaaaaaaaa1";
const EMP_A2 = "cempaaaaaaaaaaaaaaaaaaaa2";
const EMP_B1 = "cempbbbbbbbbbbbbbbbbbbbb1";

type CtxOpts = {
  role?: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | "SUPER_ADMIN";
  companyId?: string | null;
  userId?: string;
  isPlatformAdmin?: boolean;
  /** Force le helper requireCompanyContext à retourner une erreur (401). */
  unauthorized?: boolean;
};

function setCtx(opts: CtxOpts = {}) {
  const requireMock = requireCompanyContext as jest.Mock;
  if (opts.unauthorized) {
    const { NextResponse } = require("next/server");
    requireMock.mockResolvedValue({
      ctx: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    return;
  }
  requireMock.mockResolvedValue({
    ctx: {
      userId: opts.userId ?? USER_OWNER_A,
      role: opts.role ?? "OWNER",
      companyId: opts.companyId === undefined ? COMPANY_A : opts.companyId,
      isPlatformAdmin: opts.isPlatformAdmin ?? false,
    },
    error: null,
  });
}

function setScopedStores(stores: string[] | null) {
  (getCompanyScopedStoreIds as jest.Mock).mockResolvedValue(stores);
}

function setEmployeeUserMapping(employeeId: string | null) {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(
    employeeId ? { employeeId } : null,
  );
}

function setEmployeeFindUnique(opts: {
  employee: {
    id: string;
    employeeCode?: string;
    firstName?: string;
    lastName?: string;
    contractType?: string | null;
    weeklyHours?: number | null;
    companyId: string;
    stores: { storeId: string }[];
    costConfig?: { hourlyRateGross: number } | null;
  } | null;
}) {
  (prisma.employee.findUnique as jest.Mock).mockResolvedValue(
    opts.employee
      ? {
          employeeCode: "EMP-001",
          firstName: "Alice",
          lastName: "Martin",
          contractType: "CDI",
          weeklyHours: 35,
          costConfig: null,
          ...opts.employee,
        }
      : null,
  );
}

function mkReq(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Defaults
  setScopedStores([STORE_A1, STORE_A2]);
  (fetchTimesheetShifts as jest.Mock).mockResolvedValue([]);
  (fetchTimesheetClockIns as jest.Mock).mockResolvedValue([]);
  (fetchApprovedAbsences as jest.Mock).mockResolvedValue([]);
  (fetchEmployeesContext as jest.Mock).mockResolvedValue(new Map());
  (fetchStoresContext as jest.Mock).mockResolvedValue(new Map());
});

// ────────────────────────────────────────────────────────────────────────────
// /api/timesheet
// ────────────────────────────────────────────────────────────────────────────

describe("GET /api/timesheet — auth/RBAC", () => {
  it("401 si non authentifié", async () => {
    setCtx({ unauthorized: true });
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    expect(res.status).toBe(401);
  });

  it("400 si SUPER_ADMIN sans companyId", async () => {
    setCtx({ role: "SUPER_ADMIN", companyId: null, isPlatformAdmin: true });
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/SUPER_ADMIN/);
  });

  it("OWNER company A → query passée avec companyId A uniquement", async () => {
    setCtx({ role: "OWNER", companyId: COMPANY_A });
    await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    const callArgs = (fetchTimesheetShifts as jest.Mock).mock.calls[0][0];
    expect(callArgs.companyId).toBe(COMPANY_A);
    expect(callArgs.companyId).not.toBe(COMPANY_B);
  });

  it("ADMIN company A → query passée avec companyId A uniquement", async () => {
    setCtx({ role: "ADMIN", companyId: COMPANY_A });
    await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    const callArgs = (fetchTimesheetShifts as jest.Mock).mock.calls[0][0];
    expect(callArgs.companyId).toBe(COMPANY_A);
    expect(callArgs.companyId).not.toBe(COMPANY_B);
    // OWNER/ADMIN ne doivent PAS avoir storeIdsAllowed restreint
    expect(callArgs.storeIdsAllowed).toBeUndefined();
  });

  it("MANAGER → query passée avec storeIdsAllowed = scoped stores", async () => {
    setCtx({ role: "MANAGER", companyId: COMPANY_A });
    setScopedStores([STORE_A1]);
    await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    const callArgs = (fetchTimesheetShifts as jest.Mock).mock.calls[0][0];
    expect(callArgs.storeIdsAllowed).toEqual([STORE_A1]);
  });

  it("MANAGER avec storeId query hors scope → 403", async () => {
    setCtx({ role: "MANAGER", companyId: COMPANY_A });
    setScopedStores([STORE_A1]);
    // STORE_A2 est dans la company mais pas dans le scope manager
    const res = await timesheetGET(
      mkReq(
        `http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17&storeId=${STORE_A2}`,
      ),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/périmètre|scope|hors/i);
  });

  it("EMPLOYEE → employeeId forcé à son propre employeeId (pas la query)", async () => {
    setCtx({ role: "EMPLOYEE", companyId: COMPANY_A, userId: USER_EMP_A1 });
    setEmployeeUserMapping(EMP_A1);
    setScopedStores([STORE_A1]);
    // Employee tente de passer un employeeId d'un autre via query
    await timesheetGET(
      mkReq(
        `http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17&employeeId=${EMP_A2}`,
      ),
    );
    const callArgs = (fetchTimesheetShifts as jest.Mock).mock.calls[0][0];
    // Forcé sur EMP_A1 (son propre employeeId)
    expect(callArgs.employeeId).toBe(EMP_A1);
    expect(callArgs.employeeId).not.toBe(EMP_A2);
  });

  it("EMPLOYEE sans employeeId lié → 403", async () => {
    setCtx({ role: "EMPLOYEE", companyId: COMPANY_A, userId: USER_EMP_A1 });
    setEmployeeUserMapping(null); // pas d'employee link
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    expect(res.status).toBe(403);
  });

  it("EMPLOYEE → hourlyRateGross masqué dans rows même si query.ts en retourne", async () => {
    setCtx({ role: "EMPLOYEE", companyId: COMPANY_A, userId: USER_EMP_A1 });
    setEmployeeUserMapping(EMP_A1);
    setScopedStores([STORE_A1]);
    // Simuler des données qui causeraient des rows avec money fields
    (fetchTimesheetShifts as jest.Mock).mockResolvedValue([
      {
        id: "s1",
        date: new Date("2026-05-11T00:00:00Z"),
        startTime: "09:00",
        endTime: "17:30",
        storeId: STORE_A1,
        employeeId: EMP_A1,
        note: null,
        assignmentReason: null,
      },
    ]);
    const empMap = new Map();
    empMap.set(EMP_A1, {
      id: EMP_A1,
      employeeCode: "EMP-001",
      firstName: "Alice",
      lastName: "Martin",
      email: null,
      contractType: "CDI",
      weeklyHours: 35,
      hourlyRateGross: 12, // si masquage casse → ce 12 fuiterait
    });
    (fetchEmployeesContext as jest.Mock).mockResolvedValue(empMap);
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows[0].hourlyRateGross).toBeNull();
    expect(body.rows[0].estimatedGrossCost).toBeNull();
    expect(body.totals.estimatedGrossCost).toBeNull();
  });
});

describe("GET /api/timesheet — validation Zod", () => {
  beforeEach(() => {
    setCtx({ role: "OWNER", companyId: COMPANY_A });
  });

  it("dateFrom > dateTo → 400", async () => {
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-20&dateTo=2026-05-11"),
    );
    expect(res.status).toBe(400);
  });

  it("Range > 92 jours → 400", async () => {
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-01-01&dateTo=2026-06-01"),
    );
    expect(res.status).toBe(400);
  });

  it("Date format invalide (mois 13) → 400 ou date NaN → 400", async () => {
    // La regex \d{4}-\d{2}-\d{2} accepte le format, mais new Date('2026-13-01')
    // donne Invalid Date → la refine "range <= 92 days" calcule NaN <= 92 = false → 400.
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-13-01&dateTo=2026-13-01"),
    );
    expect(res.status).toBe(400);
  });

  it("groupBy invalide → 400", async () => {
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17&groupBy=foo"),
    );
    expect(res.status).toBe(400);
  });

  it("Date format pas YYYY-MM-DD → 400", async () => {
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026/05/11&dateTo=2026/05/17"),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/timesheet — comportement métier", () => {
  beforeEach(() => {
    setCtx({ role: "OWNER", companyId: COMPANY_A });
  });

  it("includeAnomalies=true → champ anomalies présent dans response", async () => {
    const res = await timesheetGET(
      mkReq(
        "http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17&includeAnomalies=true",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.anomalies).toBeDefined();
    expect(Array.isArray(body.anomalies)).toBe(true);
  });

  it("includeAnomalies=false (défaut) → champ anomalies absent", async () => {
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.anomalies).toBeUndefined();
  });

  it("unassignedPlannedMinutes séparé en groupBy=employee", async () => {
    (fetchTimesheetShifts as jest.Mock).mockResolvedValue([
      {
        id: "s1",
        date: new Date("2026-05-11T00:00:00Z"),
        startTime: "09:00",
        endTime: "13:00", // 240 min
        storeId: STORE_A1,
        employeeId: null, // unassigned
        note: null,
        assignmentReason: null,
      },
    ]);
    const res = await timesheetGET(
      mkReq("http://localhost/api/timesheet?dateFrom=2026-05-11&dateTo=2026-05-17&groupBy=employee"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totals.unassignedPlannedMinutes).toBe(240);
    // L'unassigned ne crée pas de row employee
    expect(body.rows).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// /api/timesheet/employees/[id]
// ────────────────────────────────────────────────────────────────────────────

describe("GET /api/timesheet/employees/[id] — RBAC critique", () => {
  it("EMPLOYEE accédant à un autre employee → 403", async () => {
    setCtx({ role: "EMPLOYEE", companyId: COMPANY_A, userId: USER_EMP_A1 });
    setEmployeeUserMapping(EMP_A1); // son propre employeeId
    const res = await employeeGET(
      mkReq(
        `http://localhost/api/timesheet/employees/${EMP_A2}?dateFrom=2026-05-11&dateTo=2026-05-17`,
      ),
      { params: Promise.resolve({ id: EMP_A2 }) },
    );
    expect(res.status).toBe(403);
  });

  it("EMPLOYEE accédant à lui-même → 200", async () => {
    setCtx({ role: "EMPLOYEE", companyId: COMPANY_A, userId: USER_EMP_A1 });
    setEmployeeUserMapping(EMP_A1);
    setEmployeeFindUnique({
      employee: {
        id: EMP_A1,
        companyId: COMPANY_A,
        stores: [{ storeId: STORE_A1 }],
      },
    });
    const res = await employeeGET(
      mkReq(
        `http://localhost/api/timesheet/employees/${EMP_A1}?dateFrom=2026-05-11&dateTo=2026-05-17`,
      ),
      { params: Promise.resolve({ id: EMP_A1 }) },
    );
    expect(res.status).toBe(200);
  });

  it("MANAGER → employé d'un store HORS son scope (même company) → 403 ⚠ CRITIQUE", async () => {
    setCtx({ role: "MANAGER", companyId: COMPANY_A });
    setScopedStores([STORE_A1]); // manager limité à STORE_A1
    setEmployeeFindUnique({
      employee: {
        id: EMP_A2,
        companyId: COMPANY_A, // même company
        stores: [{ storeId: STORE_A2 }], // mais store hors scope manager
      },
    });
    const res = await employeeGET(
      mkReq(
        `http://localhost/api/timesheet/employees/${EMP_A2}?dateFrom=2026-05-11&dateTo=2026-05-17`,
      ),
      { params: Promise.resolve({ id: EMP_A2 }) },
    );
    expect(res.status).toBe(403);
  });

  it("MANAGER → employé dans son scope → 200", async () => {
    setCtx({ role: "MANAGER", companyId: COMPANY_A });
    setScopedStores([STORE_A1]);
    setEmployeeFindUnique({
      employee: {
        id: EMP_A1,
        companyId: COMPANY_A,
        stores: [{ storeId: STORE_A1 }], // dans scope
      },
    });
    const res = await employeeGET(
      mkReq(
        `http://localhost/api/timesheet/employees/${EMP_A1}?dateFrom=2026-05-11&dateTo=2026-05-17`,
      ),
      { params: Promise.resolve({ id: EMP_A1 }) },
    );
    expect(res.status).toBe(200);
  });

  it("Cross-company : OWNER company A demandant employé company B → 404 (mask)", async () => {
    setCtx({ role: "OWNER", companyId: COMPANY_A });
    setEmployeeFindUnique({
      employee: {
        id: EMP_B1,
        companyId: COMPANY_B, // autre company
        stores: [{ storeId: STORE_B1 }],
      },
    });
    const res = await employeeGET(
      mkReq(
        `http://localhost/api/timesheet/employees/${EMP_B1}?dateFrom=2026-05-11&dateTo=2026-05-17`,
      ),
      { params: Promise.resolve({ id: EMP_B1 }) },
    );
    expect(res.status).toBe(404);
  });

  it("Employé inexistant → 404", async () => {
    setCtx({ role: "OWNER", companyId: COMPANY_A });
    setEmployeeFindUnique({ employee: null });
    const res = await employeeGET(
      mkReq(
        `http://localhost/api/timesheet/employees/${EMP_A1}?dateFrom=2026-05-11&dateTo=2026-05-17`,
      ),
      { params: Promise.resolve({ id: EMP_A1 }) },
    );
    expect(res.status).toBe(404);
  });

  it("ID invalide (pas cuid) → 400", async () => {
    setCtx({ role: "OWNER", companyId: COMPANY_A });
    const res = await employeeGET(
      mkReq(
        `http://localhost/api/timesheet/employees/not-a-cuid?dateFrom=2026-05-11&dateTo=2026-05-17`,
      ),
      { params: Promise.resolve({ id: "not-a-cuid" }) },
    );
    expect(res.status).toBe(400);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// /api/timesheet/today
// ────────────────────────────────────────────────────────────────────────────

describe("GET /api/timesheet/today — RBAC", () => {
  it("EMPLOYEE → 403 (endpoint réservé manager)", async () => {
    setCtx({ role: "EMPLOYEE", companyId: COMPANY_A });
    const res = await todayGET(mkReq("http://localhost/api/timesheet/today"));
    expect(res.status).toBe(403);
  });

  it("OWNER → 200 et query passée sans storeIdsAllowed restreint", async () => {
    setCtx({ role: "OWNER", companyId: COMPANY_A });
    const res = await todayGET(mkReq("http://localhost/api/timesheet/today"));
    expect(res.status).toBe(200);
    const callArgs = (fetchTimesheetShifts as jest.Mock).mock.calls[0][0];
    expect(callArgs.companyId).toBe(COMPANY_A);
    expect(callArgs.storeIdsAllowed).toBeUndefined();
  });

  it("MANAGER → query restreinte à ses stores", async () => {
    setCtx({ role: "MANAGER", companyId: COMPANY_A });
    setScopedStores([STORE_A1]);
    const res = await todayGET(mkReq("http://localhost/api/timesheet/today"));
    expect(res.status).toBe(200);
    const callArgs = (fetchTimesheetShifts as jest.Mock).mock.calls[0][0];
    expect(callArgs.storeIdsAllowed).toEqual([STORE_A1]);
  });

  it("MANAGER + storeId hors scope → 403", async () => {
    setCtx({ role: "MANAGER", companyId: COMPANY_A });
    setScopedStores([STORE_A1]);
    const res = await todayGET(
      mkReq(`http://localhost/api/timesheet/today?storeId=${STORE_A2}`),
    );
    expect(res.status).toBe(403);
  });

  it("SUPER_ADMIN sans companyId → 400", async () => {
    setCtx({
      role: "SUPER_ADMIN",
      companyId: null,
      isPlatformAdmin: true,
    });
    const res = await todayGET(mkReq("http://localhost/api/timesheet/today"));
    expect(res.status).toBe(400);
  });
});
