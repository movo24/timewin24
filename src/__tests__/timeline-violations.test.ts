import { detectShiftViolations } from "@/lib/timeline-utils";
import type { TimelineShift, StoreScheduleInfo } from "@/lib/timeline-utils";

// M116 / M004 — détection des violations d'un shift vis-à-vis de l'horaire
// magasin du jour : fermeture, hors-horaires, max employés, max simultanés.

const ts = (o: Partial<TimelineShift>): TimelineShift => ({
  id: "x", storeId: "s1", employeeId: "e1", date: "2026-06-22",
  startTime: "09:00", endTime: "17:00", note: null,
  store: { id: "s1", name: "S" }, employee: null, ...o,
});

const sched = (o: Partial<StoreScheduleInfo>): StoreScheduleInfo => ({
  dayOfWeek: 1, closed: false, openTime: "08:00", closeTime: "20:00",
  minEmployees: 1, maxEmployees: null, maxSimultaneous: null, ...o,
});

describe("detectShiftViolations", () => {
  it("retourne [] quand il n'y a pas d'horaire magasin", () => {
    expect(detectShiftViolations(ts({}), [ts({})], null)).toEqual([]);
  });

  it("magasin fermé → store_closed et court-circuite les autres règles", () => {
    const shift = ts({ startTime: "06:00", endTime: "23:00" }); // aussi hors horaires
    const v = detectShiftViolations(shift, [shift], sched({ closed: true }));
    expect(v).toHaveLength(1);
    expect(v[0].type).toBe("store_closed");
  });

  it("shift dans les horaires → aucune violation", () => {
    const shift = ts({ startTime: "09:00", endTime: "17:00" });
    expect(detectShiftViolations(shift, [shift], sched({ openTime: "08:00", closeTime: "20:00" }))).toEqual([]);
  });

  it("début avant l'ouverture → outside_hours", () => {
    const shift = ts({ startTime: "07:00", endTime: "12:00" });
    const v = detectShiftViolations(shift, [shift], sched({ openTime: "08:00", closeTime: "20:00" }));
    expect(v.map((x) => x.type)).toContain("outside_hours");
  });

  it("fin après la fermeture → outside_hours", () => {
    const shift = ts({ startTime: "18:00", endTime: "21:00" });
    const v = detectShiftViolations(shift, [shift], sched({ openTime: "08:00", closeTime: "20:00" }));
    expect(v.map((x) => x.type)).toContain("outside_hours");
  });

  it("trop d'employés distincts → max_employees avec le bon ratio", () => {
    const day = [
      ts({ id: "a", employeeId: "e1" }),
      ts({ id: "b", employeeId: "e2" }),
      ts({ id: "c", employeeId: "e3" }),
    ];
    const v = detectShiftViolations(day[0], day, sched({ maxEmployees: 2 }));
    const me = v.find((x) => x.type === "max_employees");
    expect(me).toBeDefined();
    expect(me!.message).toBe("3/2 emp.");
  });

  it("ne compte pas les shifts non assignés dans max_employees", () => {
    const day = [
      ts({ id: "a", employeeId: "e1" }),
      ts({ id: "b", employeeId: null }),
    ];
    const v = detectShiftViolations(day[0], day, sched({ maxEmployees: 1 }));
    expect(v.find((x) => x.type === "max_employees")).toBeUndefined();
  });

  it("pic de simultanéité dépassé → max_simultaneous", () => {
    const day = [
      ts({ id: "a", employeeId: "e1", startTime: "09:00", endTime: "13:00" }),
      ts({ id: "b", employeeId: "e2", startTime: "11:00", endTime: "15:00" }),
    ];
    const v = detectShiftViolations(day[0], day, sched({ maxSimultaneous: 1 }));
    const ms = v.find((x) => x.type === "max_simultaneous");
    expect(ms).toBeDefined();
    expect(ms!.message).toBe("2/1 simul.");
  });

  it("shifts qui s'enchaînent sans chevauchement → pas de max_simultaneous", () => {
    const day = [
      ts({ id: "a", employeeId: "e1", startTime: "09:00", endTime: "12:00" }),
      ts({ id: "b", employeeId: "e2", startTime: "12:00", endTime: "15:00" }),
    ];
    const v = detectShiftViolations(day[0], day, sched({ maxSimultaneous: 1 }));
    expect(v.find((x) => x.type === "max_simultaneous")).toBeUndefined();
  });

  it("cumule plusieurs violations (hors horaires + simultanéité)", () => {
    const day = [
      ts({ id: "a", employeeId: "e1", startTime: "07:00", endTime: "13:00" }),
      ts({ id: "b", employeeId: "e2", startTime: "09:00", endTime: "15:00" }),
    ];
    const v = detectShiftViolations(day[0], day, sched({ openTime: "08:00", closeTime: "20:00", maxSimultaneous: 1 }));
    const types = v.map((x) => x.type);
    expect(types).toContain("outside_hours");
    expect(types).toContain("max_simultaneous");
  });
});
