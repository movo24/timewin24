/**
 * Tests fonctionnels purs sur `buildTodayResponse()`.
 *
 * Pas de DB, pas de NextAuth, pas de Prisma. On injecte des fixtures et
 * on valide la transformation métier de la vue "Aujourd'hui Manager".
 *
 * Cible :
 *   - summary : KPIs globaux
 *   - stores  : breakdown par magasin + presentNow (PII filter)
 *   - alerts  : CLOCKIN_NOT_CLOSED (>12h seuil V1) + LATE
 *
 * `now` est injectable pour rendre les tests déterministes (pas
 * dépendants de Date.now() réel).
 */
import {
  buildTodayResponse,
  type TodayAlert,
} from "@/lib/timesheet/today";
import type {
  TimesheetShift,
  TimesheetClockIn,
  TimesheetAbsence,
  EmployeeContext,
  StoreContext,
} from "@/lib/timesheet/query";

// ─── Fixture helpers ────────────────────────────────────────────────────────

const DAY = (iso: string) => new Date(iso + "T00:00:00Z");
const TS = (iso: string) => new Date(iso);

let counter = 0;
const id = (prefix: string) => `${prefix}${(++counter).toString().padStart(4, "0")}`;

function mkShift(opts: Partial<TimesheetShift> = {}): TimesheetShift {
  return {
    id: opts.id ?? id("shift_"),
    storeId: opts.storeId ?? "store_a",
    employeeId: opts.employeeId === undefined ? "emp_a" : opts.employeeId,
    date: opts.date ?? DAY("2026-05-16"),
    startTime: opts.startTime ?? "09:00",
    endTime: opts.endTime ?? "17:00",
    note: opts.note ?? null,
    assignmentReason: opts.assignmentReason ?? null,
  };
}

function mkClockIn(opts: Partial<TimesheetClockIn> = {}): TimesheetClockIn {
  return {
    id: opts.id ?? id("ci_"),
    employeeId: opts.employeeId ?? "emp_a",
    storeId: opts.storeId ?? "store_a",
    shiftId: opts.shiftId === undefined ? null : opts.shiftId,
    clockInAt: opts.clockInAt ?? TS("2026-05-16T09:00:00Z"),
    clockOutAt: opts.clockOutAt === undefined
      ? TS("2026-05-16T17:00:00Z")
      : opts.clockOutAt,
    lateMinutes: opts.lateMinutes ?? 0,
    status: opts.status ?? "ON_TIME",
  };
}

function mkAbsence(opts: Partial<TimesheetAbsence> = {}): TimesheetAbsence {
  return {
    id: opts.id ?? id("abs_"),
    employeeId: opts.employeeId ?? "emp_a",
    type: opts.type ?? "MALADIE",
    startDate: opts.startDate ?? DAY("2026-05-16"),
    endDate: opts.endDate ?? DAY("2026-05-16"),
  };
}

function mkEmpMap(...employees: Partial<EmployeeContext>[]): Map<string, EmployeeContext> {
  const map = new Map<string, EmployeeContext>();
  for (const e of employees) {
    const empId = e.id ?? "emp_a";
    map.set(empId, {
      id: empId,
      employeeCode: e.employeeCode ?? "EMP-001",
      firstName: e.firstName ?? "Alice",
      lastName: e.lastName ?? "Martin",
      email: e.email ?? null,
      contractType: e.contractType ?? "CDI",
      weeklyHours: e.weeklyHours ?? 35,
      hourlyRateGross: e.hourlyRateGross === undefined ? 12 : e.hourlyRateGross,
    });
  }
  return map;
}

function mkStoreMap(...stores: Partial<StoreContext>[]): Map<string, StoreContext> {
  const map = new Map<string, StoreContext>();
  for (const s of stores) {
    const sid = s.id ?? "store_a";
    map.set(sid, {
      id: sid,
      name: s.name ?? "Paris Demo",
      storeCode: s.storeCode ?? null,
      city: s.city ?? null,
      timezone: s.timezone ?? "Europe/Paris",
    });
  }
  return map;
}

const defaultInput = (overrides: Partial<Parameters<typeof buildTodayResponse>[0]> = {}) => ({
  shifts: [] as TimesheetShift[],
  clockIns: [] as TimesheetClockIn[],
  absences: [] as TimesheetAbsence[],
  employeesMap: mkEmpMap({ id: "emp_a" }),
  storesMap: mkStoreMap({ id: "store_a" }),
  now: TS("2026-05-16T14:00:00Z"),
  ...overrides,
});

// ─── Tests : summary global ─────────────────────────────────────────────────

describe("buildTodayResponse — summary global", () => {
  it("Données vides → tous compteurs à 0, coverageRate=0", () => {
    const res = buildTodayResponse(defaultInput());
    expect(res.summary.storesActive).toBe(0);
    expect(res.summary.shiftsPlanned).toBe(0);
    expect(res.summary.shiftsCovered).toBe(0);
    expect(res.summary.clockInsTotal).toBe(0);
    expect(res.summary.clockInsOpen).toBe(0);
    expect(res.summary.coverageRate).toBe(0);
    expect(res.summary.absencesApproved).toBe(0);
    expect(res.stores).toEqual([]);
    expect(res.alerts).toEqual([]);
  });

  it("storesActive = nb stores avec activité (shift OU clockIn)", () => {
    const res = buildTodayResponse(
      defaultInput({
        shifts: [mkShift({ storeId: "store_a" })],
        clockIns: [mkClockIn({ storeId: "store_b", clockOutAt: null })], // pas de shift sur store_b
        storesMap: mkStoreMap(
          { id: "store_a", name: "Alpha" },
          { id: "store_b", name: "Beta" },
        ),
      }),
    );
    expect(res.summary.storesActive).toBe(2);
  });

  it("shiftsCovered = shifts avec au moins 1 clockIn lié", () => {
    const res = buildTodayResponse(
      defaultInput({
        shifts: [
          mkShift({ id: "s1", employeeId: "emp_a" }),
          mkShift({ id: "s2", employeeId: "emp_a" }),
          mkShift({ id: "s3", employeeId: "emp_a" }), // pas pointé
        ],
        clockIns: [
          mkClockIn({ shiftId: "s1" }),
          mkClockIn({ shiftId: "s2" }),
        ],
      }),
    );
    expect(res.summary.shiftsPlanned).toBe(3);
    expect(res.summary.shiftsCovered).toBe(2);
    expect(res.summary.shiftsUncovered).toBe(1);
  });

  it("coverageRate = shiftsCovered / shiftsPlanned (0..1)", () => {
    const res = buildTodayResponse(
      defaultInput({
        shifts: [
          mkShift({ id: "s1", employeeId: "emp_a" }),
          mkShift({ id: "s2", employeeId: "emp_a" }),
          mkShift({ id: "s3", employeeId: "emp_a" }),
          mkShift({ id: "s4", employeeId: "emp_a" }),
        ],
        clockIns: [
          mkClockIn({ shiftId: "s1" }),
          mkClockIn({ shiftId: "s2" }),
          mkClockIn({ shiftId: "s3" }),
        ],
      }),
    );
    expect(res.summary.coverageRate).toBe(0.75);
  });

  it("clockInsOpen = clockIns avec clockOutAt=null", () => {
    const res = buildTodayResponse(
      defaultInput({
        clockIns: [
          mkClockIn({ id: "ci_open1", clockOutAt: null }),
          mkClockIn({ id: "ci_closed", clockOutAt: TS("2026-05-16T17:00:00Z") }),
          mkClockIn({ id: "ci_open2", clockOutAt: null }),
        ],
      }),
    );
    expect(res.summary.clockInsOpen).toBe(2);
    expect(res.summary.clockInsTotal).toBe(3);
  });

  it("absencesApproved = nb employés distincts en absence aujourd'hui", () => {
    const res = buildTodayResponse(
      defaultInput({
        absences: [
          mkAbsence({ employeeId: "emp_a" }),
          mkAbsence({ employeeId: "emp_b" }),
          mkAbsence({ employeeId: "emp_a" }), // doublon volontaire — Set dédupe
        ],
        employeesMap: mkEmpMap(
          { id: "emp_a" },
          { id: "emp_b" },
        ),
      }),
    );
    expect(res.summary.absencesApproved).toBe(2);
  });
});

// ─── Tests : per-store ──────────────────────────────────────────────────────

describe("buildTodayResponse — per-store", () => {
  it("Shifts et clockIns regroupés par storeId", () => {
    const res = buildTodayResponse(
      defaultInput({
        shifts: [
          mkShift({ id: "s1", storeId: "store_a", startTime: "09:00", endTime: "12:00" }),
          mkShift({ id: "s2", storeId: "store_b", startTime: "09:00", endTime: "12:00" }),
        ],
        clockIns: [
          mkClockIn({ storeId: "store_a", shiftId: "s1" }),
        ],
        storesMap: mkStoreMap(
          { id: "store_a", name: "Alpha" },
          { id: "store_b", name: "Beta" },
        ),
      }),
    );
    expect(res.stores).toHaveLength(2);
    const alpha = res.stores.find((s) => s.storeName === "Alpha")!;
    const beta = res.stores.find((s) => s.storeName === "Beta")!;
    expect(alpha.shiftsCovered).toBe(1);
    expect(beta.shiftsCovered).toBe(0);
  });

  it("presentNow = employés avec clockIn ouvert (firstName/lastName)", () => {
    const res = buildTodayResponse(
      defaultInput({
        clockIns: [
          mkClockIn({ employeeId: "emp_a", clockOutAt: null }),
          mkClockIn({ employeeId: "emp_b", clockOutAt: null }),
          mkClockIn({ employeeId: "emp_c", clockOutAt: TS("2026-05-16T17:00:00Z") }), // pas présent
        ],
        employeesMap: mkEmpMap(
          { id: "emp_a", firstName: "Alice", lastName: "Martin" },
          { id: "emp_b", firstName: "Bob", lastName: "Dupont" },
          { id: "emp_c", firstName: "Carla", lastName: "Lopez" },
        ),
      }),
    );
    expect(res.stores[0].presentNow).toHaveLength(2);
    const present = res.stores[0].presentNow.map((p) => `${p.firstName} ${p.lastName}`);
    expect(present).toContain("Alice Martin");
    expect(present).toContain("Bob Dupont");
    expect(present.find((p) => p.includes("Carla"))).toBeUndefined();
  });

  it("presentNow ne contient PAS d'email / GPS / photo (PII filter)", () => {
    const res = buildTodayResponse(
      defaultInput({
        clockIns: [
          mkClockIn({ employeeId: "emp_a", clockOutAt: null }),
        ],
        employeesMap: mkEmpMap({
          id: "emp_a",
          firstName: "Alice",
          lastName: "Martin",
          email: "alice@example.com",
        }),
      }),
    );
    const p = res.stores[0].presentNow[0];
    expect(p).toEqual({
      employeeId: "emp_a",
      firstName: "Alice",
      lastName: "Martin",
    });
    expect(p).not.toHaveProperty("email");
    expect(p).not.toHaveProperty("hourlyRateGross");
    expect(p).not.toHaveProperty("latitude");
    expect(p).not.toHaveProperty("longitude");
    expect(p).not.toHaveProperty("photoPath");
  });

  it("Stores triés par nom alphabétique", () => {
    const res = buildTodayResponse(
      defaultInput({
        shifts: [
          mkShift({ storeId: "z_store" }),
          mkShift({ storeId: "a_store" }),
          mkShift({ storeId: "m_store" }),
        ],
        storesMap: mkStoreMap(
          { id: "z_store", name: "Zorglub" },
          { id: "a_store", name: "Alpha" },
          { id: "m_store", name: "Mistral" },
        ),
      }),
    );
    expect(res.stores.map((s) => s.storeName)).toEqual([
      "Alpha",
      "Mistral",
      "Zorglub",
    ]);
  });
});

// ─── Tests : alerts ─────────────────────────────────────────────────────────

describe("buildTodayResponse — alerts", () => {
  it("CLOCKIN_NOT_CLOSED firé si clockIn ouvert > 12h", () => {
    const now = TS("2026-05-16T22:00:00Z");
    const res = buildTodayResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            id: "ci_long",
            clockInAt: TS("2026-05-16T08:00:00Z"), // 14h écoulées
            clockOutAt: null,
          }),
        ],
        now,
      }),
    );
    const a = res.alerts.find((a) => a.type === "CLOCKIN_NOT_CLOSED");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
    expect(a!.clockInId).toBe("ci_long");
  });

  it("CLOCKIN_NOT_CLOSED NON firé si clockIn ouvert < 12h", () => {
    const now = TS("2026-05-16T14:00:00Z");
    const res = buildTodayResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            clockInAt: TS("2026-05-16T09:00:00Z"), // 5h écoulées
            clockOutAt: null,
          }),
        ],
        now,
      }),
    );
    const a = res.alerts.find((a) => a.type === "CLOCKIN_NOT_CLOSED");
    expect(a).toBeUndefined();
  });

  it("LATE firé pour lateMinutes > 0", () => {
    const res = buildTodayResponse(
      defaultInput({
        clockIns: [
          mkClockIn({ id: "ci_late", lateMinutes: 15 }),
        ],
      }),
    );
    const a = res.alerts.find((a) => a.type === "LATE");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("INFO");
    expect(a!.clockInId).toBe("ci_late");
    expect(a!.message).toContain("15");
  });

  it("Aucune alerte SHIFT_WITHOUT_CLOCKIN (volontairement exclue en today)", () => {
    const res = buildTodayResponse(
      defaultInput({
        shifts: [
          mkShift({ id: "s_orphan", employeeId: "emp_a" }), // pas pointé
        ],
        clockIns: [],
      }),
    );
    const types = res.alerts.map((a) => a.type as string);
    expect(types).not.toContain("SHIFT_WITHOUT_CLOCKIN");
  });
});

// ─── Tests : déterminisme + edge ────────────────────────────────────────────

describe("buildTodayResponse — déterminisme & edge", () => {
  it("`now` injectable rend les tests déterministes", () => {
    // Si on appelle 2x avec le même now, on doit avoir le même résultat
    const input = defaultInput({
      clockIns: [
        mkClockIn({
          clockInAt: TS("2026-05-16T05:00:00Z"),
          clockOutAt: null,
        }),
      ],
    });
    const a = buildTodayResponse(input);
    const b = buildTodayResponse(input);
    expect(a).toEqual(b);
  });

  it("ClockIn ouvert mais now < 12h après → pas d'alerte mais clockInsOpen incrémenté", () => {
    const now = TS("2026-05-16T12:00:00Z");
    const res = buildTodayResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            clockInAt: TS("2026-05-16T08:00:00Z"), // 4h
            clockOutAt: null,
          }),
        ],
        now,
      }),
    );
    expect(res.summary.clockInsOpen).toBe(1);
    expect(res.alerts.filter((a) => a.type === "CLOCKIN_NOT_CLOSED")).toHaveLength(0);
  });
});
