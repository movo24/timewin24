import { assignLanes, calculateCoverage, getEmployeeColor } from "@/lib/timeline-utils";
import type { TimelineShift } from "@/lib/timeline-utils";

// M116 / M004 — rendu timeline planning : packing en lanes, couverture horaire, couleur.

const ts = (o: Partial<TimelineShift>): TimelineShift => ({
  id: "x", storeId: "s1", employeeId: "e1", date: "2026-06-22",
  startTime: "09:00", endTime: "17:00", note: null,
  store: { id: "s1", name: "S" }, employee: null, ...o,
});

describe("assignLanes (packing d'intervalles)", () => {
  it("retourne [] pour une liste vide", () => {
    expect(assignLanes([])).toEqual([]);
  });
  it("deux shifts non chevauchants → même lane 0", () => {
    const r = assignLanes([
      ts({ id: "a", startTime: "09:00", endTime: "12:00" }),
      ts({ id: "b", startTime: "13:00", endTime: "16:00" }),
    ]);
    expect(r.find((s) => s.id === "a")!.lane).toBe(0);
    expect(r.find((s) => s.id === "b")!.lane).toBe(0);
    expect(r.every((s) => s.totalLanes === 1)).toBe(true);
  });
  it("deux shifts chevauchants → lanes 0 et 1, totalLanes 2", () => {
    const r = assignLanes([
      ts({ id: "a", startTime: "09:00", endTime: "13:00" }),
      ts({ id: "b", startTime: "11:00", endTime: "15:00" }),
    ]);
    const lanes = r.map((s) => s.lane).sort();
    expect(lanes).toEqual([0, 1]);
    expect(r.every((s) => s.totalLanes === 2)).toBe(true);
  });
  it("réutilise une lane libérée (A couvre tout, B puis C s'enchaînent)", () => {
    const r = assignLanes([
      ts({ id: "A", startTime: "09:00", endTime: "17:00" }),
      ts({ id: "B", startTime: "10:00", endTime: "12:00" }),
      ts({ id: "C", startTime: "13:00", endTime: "15:00" }),
    ]);
    const lane = (id: string) => r.find((s) => s.id === id)!.lane;
    expect(lane("A")).toBe(0);
    expect(lane("B")).toBe(1);
    expect(lane("C")).toBe(1); // C réutilise la lane de B (libérée à 12:00)
    expect(r.every((s) => s.totalLanes === 2)).toBe(true);
  });
});

describe("calculateCoverage (employés présents par heure)", () => {
  it("compte les heures couvertes par un shift (bornes exclusives)", () => {
    const cov = calculateCoverage([ts({ startTime: "09:00", endTime: "12:00" })], 8, 11);
    expect(cov).toEqual([
      { hour: 8, count: 0 },
      { hour: 9, count: 1 },
      { hour: 10, count: 1 },
    ]);
  });
  it("additionne les shifts simultanés", () => {
    const cov = calculateCoverage(
      [ts({ id: "a", startTime: "09:00", endTime: "12:00" }), ts({ id: "b", startTime: "10:00", endTime: "11:00" })],
      9, 12
    );
    expect(cov.find((c) => c.hour === 10)!.count).toBe(2);
    expect(cov.find((c) => c.hour === 11)!.count).toBe(1);
  });
});

describe("getEmployeeColor", () => {
  it("couleur fixe 'non assigné' pour null", () => {
    expect(getEmployeeColor(null).bg).toBe("bg-amber-200");
  });
  it("est déterministe pour un même employeeId", () => {
    expect(getEmployeeColor("emp-42")).toEqual(getEmployeeColor("emp-42"));
  });
  it("retourne une palette de classes", () => {
    const c = getEmployeeColor("emp-1");
    expect(c).toHaveProperty("bg");
    expect(c).toHaveProperty("border");
    expect(c).toHaveProperty("text");
  });
});
