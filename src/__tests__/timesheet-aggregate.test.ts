/**
 * Tests fonctionnels purs sur `buildTimesheetResponse()`.
 *
 * Pas de DB, pas de NextAuth, pas de mock Prisma. On injecte directement
 * des fixtures (TimesheetShift[], TimesheetClockIn[], etc.) et on vérifie
 * la transformation métier.
 *
 * Couvre les ajustements validés :
 *   - A : shifts sans employeeId → unassignedPlannedMinutes (pas dans rows)
 *   - B : break estimation (informatif)
 *   - C : overtime informatif
 *   - D : absences APPROVED uniquement (filtré upstream par query.ts,
 *         ici on valide juste l'aggrégation)
 */
import {
  buildTimesheetResponse,
  type GroupBy,
  type EmployeeRow,
  type StoreRow,
  type DayRow,
  type WeekRow,
} from "@/lib/timesheet/aggregate";
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

function mkShift(opts: Partial<TimesheetShift> & {
  storeId?: string;
  employeeId?: string | null;
  date?: Date;
  startTime?: string;
  endTime?: string;
}): TimesheetShift {
  return {
    id: opts.id ?? id("shift_"),
    storeId: opts.storeId ?? "store_default",
    employeeId: opts.employeeId === undefined ? "emp_default" : opts.employeeId,
    date: opts.date ?? DAY("2026-05-11"),
    startTime: opts.startTime ?? "09:00",
    endTime: opts.endTime ?? "17:30",
    note: opts.note ?? null,
    assignmentReason: opts.assignmentReason ?? null,
  };
}

function mkClockIn(opts: Partial<TimesheetClockIn> & {
  storeId?: string;
  employeeId?: string;
  shiftId?: string | null;
  clockInAt?: Date;
  clockOutAt?: Date | null;
  lateMinutes?: number;
}): TimesheetClockIn {
  return {
    id: opts.id ?? id("ci_"),
    employeeId: opts.employeeId ?? "emp_default",
    storeId: opts.storeId ?? "store_default",
    shiftId: opts.shiftId === undefined ? null : opts.shiftId,
    clockInAt: opts.clockInAt ?? TS("2026-05-11T09:05:00Z"),
    clockOutAt: opts.clockOutAt === undefined
      ? TS("2026-05-11T17:30:00Z")
      : opts.clockOutAt,
    lateMinutes: opts.lateMinutes ?? 0,
    status: opts.status ?? "ON_TIME",
  };
}

function mkAbsence(opts: Partial<TimesheetAbsence> & {
  employeeId?: string;
  startDate?: Date;
  endDate?: Date;
}): TimesheetAbsence {
  return {
    id: opts.id ?? id("abs_"),
    employeeId: opts.employeeId ?? "emp_default",
    type: opts.type ?? "MALADIE",
    startDate: opts.startDate ?? DAY("2026-05-12"),
    endDate: opts.endDate ?? DAY("2026-05-13"),
  };
}

function mkEmpMap(...employees: Partial<EmployeeContext>[]): Map<string, EmployeeContext> {
  const map = new Map<string, EmployeeContext>();
  for (const e of employees) {
    const empId = e.id ?? "emp_default";
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
    const sid = s.id ?? "store_default";
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

const defaultInput = (overrides: Partial<Parameters<typeof buildTimesheetResponse>[0]> = {}) => ({
  shifts: [] as TimesheetShift[],
  clockIns: [] as TimesheetClockIn[],
  absences: [] as TimesheetAbsence[],
  employeesMap: mkEmpMap({ id: "emp_default" }),
  storesMap: mkStoreMap({ id: "store_default" }),
  dateFrom: DAY("2026-05-11"),
  dateTo: DAY("2026-05-17"),
  groupBy: "employee" as GroupBy,
  hideMoneyFields: false,
  includeAnomalies: false,
  now: TS("2026-05-18T10:00:00Z"),
  ...overrides,
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("buildTimesheetResponse — données vides", () => {
  it("Aucun shift, aucun clockIn, aucun absence → rows vides, totaux à 0", () => {
    const res = buildTimesheetResponse(defaultInput());
    expect(res.rows).toEqual([]);
    expect(res.totals.plannedMinutes).toBe(0);
    expect(res.totals.workedMinutes).toBe(0);
    expect(res.totals.absencesDays).toBe(0);
    expect(res.unassignedPlannedMinutes).toBe(0);
  });
});

describe("buildTimesheetResponse — groupBy=employee", () => {
  it("1 employé, 2 shifts → 1 row avec plannedMinutes additionné", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({ employeeId: "emp1", startTime: "09:00", endTime: "12:00" }), // 180
          mkShift({ employeeId: "emp1", startTime: "14:00", endTime: "18:00" }), // 240
        ],
        clockIns: [],
        employeesMap: mkEmpMap({ id: "emp1", firstName: "Alice" }),
      }),
    );
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0] as EmployeeRow;
    expect(row.employeeId).toBe("emp1");
    expect(row.plannedMinutes).toBe(420);
    expect(row.shiftsCount).toBe(2);
  });

  it("2 employés distincts → 2 rows triés par nom de famille", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({ employeeId: "emp_b", startTime: "09:00", endTime: "12:00" }),
          mkShift({ employeeId: "emp_a", startTime: "09:00", endTime: "12:00" }),
        ],
        employeesMap: mkEmpMap(
          { id: "emp_a", lastName: "Zorro" },
          { id: "emp_b", lastName: "Antonio" },
        ),
      }),
    );
    expect(res.rows).toHaveLength(2);
    expect((res.rows[0] as EmployeeRow).lastName).toBe("Antonio");
    expect((res.rows[1] as EmployeeRow).lastName).toBe("Zorro");
  });

  it("Shift sans employeeId → exclu des rows, ajouté à unassignedPlannedMinutes", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({ employeeId: "emp1", startTime: "09:00", endTime: "12:00" }), // 180
          mkShift({ employeeId: null, startTime: "14:00", endTime: "18:00" }),    // 240 unassigned
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
      }),
    );
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as EmployeeRow).employeeId).toBe("emp1");
    expect(res.unassignedPlannedMinutes).toBe(240);
    expect(res.totals.unassignedPlannedMinutes).toBe(240);
  });

  it("Multi-employee avec différents weeklyHours → overtime correct par employé", () => {
    // emp1 : 35h contractuel, pointé 40h = 5h sup
    // emp2 : 20h contractuel, pointé 25h = 5h sup
    const monStart = TS("2026-05-11T08:00:00Z");
    const clockIn40h = (empId: string) =>
      Array.from({ length: 5 }).map((_, i) =>
        mkClockIn({
          employeeId: empId,
          clockInAt: new Date(monStart.getTime() + i * 24 * 60 * 60 * 1000),
          clockOutAt: new Date(monStart.getTime() + i * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000),
        }),
      );
    const clockIn25h = (empId: string) =>
      Array.from({ length: 5 }).map((_, i) =>
        mkClockIn({
          employeeId: empId,
          clockInAt: new Date(monStart.getTime() + i * 24 * 60 * 60 * 1000),
          clockOutAt: new Date(monStart.getTime() + i * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000),
        }),
      );
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [...clockIn40h("emp1"), ...clockIn25h("emp2")],
        employeesMap: mkEmpMap(
          { id: "emp1", lastName: "A", weeklyHours: 35 },
          { id: "emp2", lastName: "B", weeklyHours: 20 },
        ),
      }),
    );
    const emp1Row = res.rows.find((r) => (r as EmployeeRow).employeeId === "emp1")!;
    const emp2Row = res.rows.find((r) => (r as EmployeeRow).employeeId === "emp2")!;
    expect((emp1Row as EmployeeRow).overtimeMinutes).toBe(5 * 60); // 5h sup
    expect((emp2Row as EmployeeRow).overtimeMinutes).toBe(5 * 60); // 5h sup
  });
});

describe("buildTimesheetResponse — groupBy=store", () => {
  it("2 stores distincts → 2 rows triés par nom", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({ storeId: "store_b", startTime: "09:00", endTime: "12:00" }),
          mkShift({ storeId: "store_a", startTime: "09:00", endTime: "12:00" }),
        ],
        storesMap: mkStoreMap(
          { id: "store_a", name: "Alpha" },
          { id: "store_b", name: "Beta" },
        ),
        groupBy: "store",
      }),
    );
    expect(res.rows).toHaveLength(2);
    expect((res.rows[0] as StoreRow).storeName).toBe("Alpha");
    expect((res.rows[1] as StoreRow).storeName).toBe("Beta");
  });

  it("Shift sans employeeId compté dans la row store (pas exclu)", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({ storeId: "store_a", employeeId: null, startTime: "09:00", endTime: "12:00" }),
        ],
        storesMap: mkStoreMap({ id: "store_a", name: "Alpha" }),
        groupBy: "store",
      }),
    );
    expect(res.rows).toHaveLength(1);
    expect((res.rows[0] as StoreRow).plannedMinutes).toBe(180);
    // En groupBy=store, unassignedPlannedMinutes reste à 0 (pertinent seulement en employee)
    expect(res.unassignedPlannedMinutes).toBe(0);
  });
});

describe("buildTimesheetResponse — groupBy=day", () => {
  it("3 jours d'activité → 3 rows triés par date", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({ date: DAY("2026-05-13"), startTime: "09:00", endTime: "12:00" }),
          mkShift({ date: DAY("2026-05-11"), startTime: "09:00", endTime: "12:00" }),
          mkShift({ date: DAY("2026-05-12"), startTime: "09:00", endTime: "12:00" }),
        ],
        groupBy: "day",
      }),
    );
    expect(res.rows.map((r) => (r as DayRow).date)).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
    ]);
  });
});

describe("buildTimesheetResponse — groupBy=week", () => {
  it("2 semaines ISO → 2 rows avec weekStart = lundi", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({ date: DAY("2026-05-13"), startTime: "09:00", endTime: "12:00" }), // semaine du 11
          mkShift({ date: DAY("2026-05-20"), startTime: "09:00", endTime: "12:00" }), // semaine du 18
        ],
        dateFrom: DAY("2026-05-11"),
        dateTo: DAY("2026-05-24"),
        groupBy: "week",
      }),
    );
    expect(res.rows).toHaveLength(2);
    const week1 = res.rows[0] as WeekRow;
    const week2 = res.rows[1] as WeekRow;
    expect(week1.weekStart).toBe("2026-05-11"); // lundi
    expect(week1.weekEnd).toBe("2026-05-17"); // dimanche
    expect(week2.weekStart).toBe("2026-05-18");
    expect(week2.weekEnd).toBe("2026-05-24");
  });
});

describe("buildTimesheetResponse — calculs métier", () => {
  it("varianceMinutes négatif si pointé < prévu", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [mkShift({ employeeId: "emp1", startTime: "09:00", endTime: "17:00" })], // 480 prévu
        clockIns: [
          mkClockIn({
            employeeId: "emp1",
            clockInAt: TS("2026-05-11T09:00:00Z"),
            clockOutAt: TS("2026-05-11T16:00:00Z"), // 420 pointé
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
      }),
    );
    const row = res.rows[0] as EmployeeRow;
    // 480 prévu, 420 pointé. Break estimé sur shift >6h = 30 min. netWorked = 420 - 30 = 390.
    // variance = 390 - 480 = -90.
    expect(row.workedMinutes).toBe(420);
    expect(row.breakMinutesEstimated).toBe(30);
    expect(row.netWorkedMinutes).toBe(390);
    expect(row.varianceMinutes).toBe(-90);
  });

  it("breakMinutesEstimated : 30 pour shift > 6h, 0 pour shift <= 6h", () => {
    const res1 = buildTimesheetResponse(
      defaultInput({
        shifts: [mkShift({ employeeId: "emp1", startTime: "09:00", endTime: "15:00" })], // 6h pile
        employeesMap: mkEmpMap({ id: "emp1" }),
      }),
    );
    expect((res1.rows[0] as EmployeeRow).breakMinutesEstimated).toBe(0);

    const res2 = buildTimesheetResponse(
      defaultInput({
        shifts: [mkShift({ employeeId: "emp1", startTime: "09:00", endTime: "15:30" })], // 6h30
        employeesMap: mkEmpMap({ id: "emp1" }),
      }),
    );
    expect((res2.rows[0] as EmployeeRow).breakMinutesEstimated).toBe(30);
  });

  it("overtimeMinutes informatif : pointé > weeklyHours → différence", () => {
    // Pointé 42h dans la semaine ISO du 11 mai (lundi)
    const monStart = TS("2026-05-11T08:00:00Z");
    const clockIns = Array.from({ length: 6 }).map((_, i) =>
      mkClockIn({
        employeeId: "emp1",
        clockInAt: new Date(monStart.getTime() + i * 24 * 60 * 60 * 1000),
        clockOutAt: new Date(monStart.getTime() + i * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000),
      }),
    );
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns,
        employeesMap: mkEmpMap({ id: "emp1", weeklyHours: 35 }),
      }),
    );
    // 6 jours x 7h = 42h, contrat 35h → 7h sup = 420
    expect((res.rows[0] as EmployeeRow).overtimeMinutes).toBe(420);
  });

  it("overtimeMinutes = 0 si weeklyHours null", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            employeeId: "emp1",
            clockInAt: TS("2026-05-11T08:00:00Z"),
            clockOutAt: TS("2026-05-11T20:00:00Z"), // 12h
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1", weeklyHours: null }),
      }),
    );
    expect((res.rows[0] as EmployeeRow).overtimeMinutes).toBe(0);
  });

  it("estimatedGrossCost = (workedMin / 60) * hourlyRateGross arrondi 2 décimales", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            employeeId: "emp1",
            clockInAt: TS("2026-05-11T09:00:00Z"),
            clockOutAt: TS("2026-05-11T17:30:00Z"), // 510 min = 8.5h
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1", hourlyRateGross: 12 }),
      }),
    );
    // 510/60 * 12 = 102.00
    expect((res.rows[0] as EmployeeRow).estimatedGrossCost).toBe(102);
  });

  it("estimatedGrossCost = null si hourlyRateGross null", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            employeeId: "emp1",
            clockInAt: TS("2026-05-11T09:00:00Z"),
            clockOutAt: TS("2026-05-11T17:30:00Z"),
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1", hourlyRateGross: null }),
      }),
    );
    expect((res.rows[0] as EmployeeRow).estimatedGrossCost).toBeNull();
  });
});

describe("buildTimesheetResponse — masquage money (EMPLOYEE)", () => {
  it("hideMoneyFields=true → hourlyRateGross et estimatedGrossCost à null dans rows", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            employeeId: "emp1",
            clockInAt: TS("2026-05-11T09:00:00Z"),
            clockOutAt: TS("2026-05-11T17:30:00Z"),
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1", hourlyRateGross: 12 }),
        hideMoneyFields: true,
      }),
    );
    expect((res.rows[0] as EmployeeRow).hourlyRateGross).toBeNull();
    expect((res.rows[0] as EmployeeRow).estimatedGrossCost).toBeNull();
  });

  it("hideMoneyFields=true → totals.estimatedGrossCost à null", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            employeeId: "emp1",
            clockInAt: TS("2026-05-11T09:00:00Z"),
            clockOutAt: TS("2026-05-11T17:30:00Z"),
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1", hourlyRateGross: 12 }),
        hideMoneyFields: true,
      }),
    );
    expect(res.totals.estimatedGrossCost).toBeNull();
  });
});

describe("buildTimesheetResponse — anomalies", () => {
  it("includeAnomalies=false → champ anomalies absent du résultat", () => {
    const res = buildTimesheetResponse(defaultInput({ includeAnomalies: false }));
    expect(res.anomalies).toBeUndefined();
  });

  it("includeAnomalies=true mais aucune anomalie → tableau vide", () => {
    const res = buildTimesheetResponse(defaultInput({ includeAnomalies: true }));
    expect(res.anomalies).toEqual([]);
  });

  it("CLOCKIN_NOT_CLOSED si clockIn ouvert > 24h", () => {
    const now = TS("2026-05-12T10:00:00Z");
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({
            id: "ci_open",
            employeeId: "emp1",
            clockInAt: TS("2026-05-11T08:00:00Z"), // 26h ago
            clockOutAt: null,
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
        includeAnomalies: true,
        now,
      }),
    );
    const a = res.anomalies!.find((a) => a.type === "CLOCKIN_NOT_CLOSED");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("CRITICAL");
    expect(a!.clockInId).toBe("ci_open");
  });

  it("CLOCKIN_WITHOUT_SHIFT si shiftId null", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({ employeeId: "emp1", shiftId: null }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
        includeAnomalies: true,
      }),
    );
    const a = res.anomalies!.find((a) => a.type === "CLOCKIN_WITHOUT_SHIFT");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("INFO");
  });

  it("SHIFT_WITHOUT_CLOCKIN si shift passé sans clockIn", () => {
    const now = TS("2026-05-15T10:00:00Z");
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({
            id: "shift_orphan",
            employeeId: "emp1",
            date: DAY("2026-05-11"), // passé
          }),
        ],
        clockIns: [],
        employeesMap: mkEmpMap({ id: "emp1" }),
        includeAnomalies: true,
        now,
      }),
    );
    const a = res.anomalies!.find((a) => a.type === "SHIFT_WITHOUT_CLOCKIN");
    expect(a).toBeDefined();
    expect(a!.shiftId).toBe("shift_orphan");
  });

  it("SHIFT_WITHOUT_CLOCKIN PAS firé pour shifts futurs", () => {
    const now = TS("2026-05-11T10:00:00Z");
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({
            employeeId: "emp1",
            date: DAY("2026-05-20"), // futur
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
        includeAnomalies: true,
        now,
      }),
    );
    const a = res.anomalies!.find((a) => a.type === "SHIFT_WITHOUT_CLOCKIN");
    expect(a).toBeUndefined();
  });

  it("LATE si lateMinutes > 0", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({ employeeId: "emp1", lateMinutes: 15 }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
        includeAnomalies: true,
      }),
    );
    const a = res.anomalies!.find((a) => a.type === "LATE");
    expect(a).toBeDefined();
    expect(a!.message).toContain("15");
  });
});

describe("buildTimesheetResponse — edge cases", () => {
  it("ClockIn ouvert (clockOutAt=null) → workedMinutes=0 mais clockInsCount++", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        clockIns: [
          mkClockIn({ employeeId: "emp1", clockOutAt: null }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
      }),
    );
    const row = res.rows[0] as EmployeeRow;
    expect(row.workedMinutes).toBe(0);
    expect(row.clockInsCount).toBe(1);
  });

  it("Absence approuvée chevauchant la fenêtre → absencesDays correct", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [mkShift({ employeeId: "emp1" })], // pour créer la row
        absences: [
          mkAbsence({
            employeeId: "emp1",
            startDate: DAY("2026-05-12"),
            endDate: DAY("2026-05-14"),
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
        dateFrom: DAY("2026-05-11"),
        dateTo: DAY("2026-05-17"),
      }),
    );
    expect((res.rows[0] as EmployeeRow).absencesDays).toBe(3);
    expect((res.rows[0] as EmployeeRow).absencesCount).toBe(1);
  });

  it("Cross-midnight shift '22:00' -> '06:00' = 480 minutes", () => {
    const res = buildTimesheetResponse(
      defaultInput({
        shifts: [
          mkShift({
            employeeId: "emp1",
            startTime: "22:00",
            endTime: "06:00",
          }),
        ],
        employeesMap: mkEmpMap({ id: "emp1" }),
      }),
    );
    expect((res.rows[0] as EmployeeRow).plannedMinutes).toBe(480);
  });
});
