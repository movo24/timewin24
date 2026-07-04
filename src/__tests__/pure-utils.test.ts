import { haversineDistance, isWithinRadius } from "@/lib/geo";
import { doTimesOverlap, calculateShiftHours } from "@/lib/shift-utils";
import {
  timeToMinutes,
  minutesToTime,
  snapMinutes,
  clampMinutes,
} from "@/lib/timeline-utils";

// M116 — couverture des utilitaires purs (GPS pointage, math horaire, timeline).
// Note : `deriveProfileCategory` (reliability-score) est pur mais co-localisé avec
// du code Prisma (import.meta incompatible jest) — non testé ici sans extraction.

describe("geo — distance & clock-in radius (M005)", () => {
  it("haversineDistance is 0 for the same point", () => {
    expect(haversineDistance(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  it("1° of latitude ≈ 111 km", () => {
    const d = haversineDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("isWithinRadius: same point is within, distance 0", () => {
    const r = isWithinRadius(48.8566, 2.3522, 48.8566, 2.3522);
    expect(r.withinRadius).toBe(true);
    expect(r.distanceMeters).toBe(0);
  });

  it("isWithinRadius: ~33m offset is within default 50m", () => {
    const r = isWithinRadius(0, 0, 0.0003, 0); // ~33.4 m
    expect(r.withinRadius).toBe(true);
    expect(r.distanceMeters).toBeGreaterThan(25);
    expect(r.distanceMeters).toBeLessThan(45);
  });

  it("isWithinRadius: far point is rejected", () => {
    const r = isWithinRadius(0, 0, 1, 0); // ~111 km
    expect(r.withinRadius).toBe(false);
  });
});

describe("shift-utils — overlap & hours (M004)", () => {
  const base = { date: "2026-06-21" };
  it("detects overlapping ranges on the same date", () => {
    expect(
      doTimesOverlap(
        { ...base, startTime: "09:00", endTime: "12:00" },
        { ...base, startTime: "11:00", endTime: "14:00" }
      )
    ).toBe(true);
  });

  it("adjacent ranges do not overlap", () => {
    expect(
      doTimesOverlap(
        { ...base, startTime: "09:00", endTime: "12:00" },
        { ...base, startTime: "12:00", endTime: "15:00" }
      )
    ).toBe(false);
  });

  it("different dates never overlap", () => {
    expect(
      doTimesOverlap(
        { date: "2026-06-21", startTime: "09:00", endTime: "18:00" },
        { date: "2026-06-22", startTime: "09:00", endTime: "18:00" }
      )
    ).toBe(false);
  });

  it("same shift id is excluded from self-overlap", () => {
    expect(
      doTimesOverlap(
        { ...base, startTime: "09:00", endTime: "18:00", id: "s1" },
        { ...base, startTime: "09:00", endTime: "18:00", id: "s1" }
      )
    ).toBe(false);
  });

  it("calculateShiftHours handles half hours", () => {
    expect(calculateShiftHours("09:00", "17:30")).toBe(8.5);
    expect(calculateShiftHours("08:00", "08:00")).toBe(0);
  });
});

describe("timeline-utils — minute conversions (M004)", () => {
  it("timeToMinutes / minutesToTime round-trip", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(timeToMinutes("00:05"))).toBe("00:05");
  });

  it("snapMinutes rounds to the nearest interval", () => {
    expect(snapMinutes(8)).toBe(15); // 8 -> 15 (round 0.53)
    expect(snapMinutes(7)).toBe(0); // 7 -> 0 (round 0.46)
    expect(snapMinutes(70)).toBe(75); // round(4.66)*15
  });

  it("clampMinutes keeps values within the grid", () => {
    expect(clampMinutes(100, 8, 20)).toBe(480); // below -> gridStart
    expect(clampMinutes(600, 8, 20)).toBe(600); // inside
    expect(clampMinutes(1300, 8, 20)).toBe(1200); // above -> gridEnd
  });
});
