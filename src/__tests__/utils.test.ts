import {
  cn,
  toUTCDate,
  getWeekBounds,
  formatDate,
  getWeekDays,
  getDayNameFr,
} from "@/lib/utils";

// M116 — utilitaires transverses (dates de planning, classes CSS). Purs.

describe("cn (merge de classes Tailwind)", () => {
  it("combine les classes", () => {
    expect(cn("a", "b")).toContain("a");
    expect(cn("a", "b")).toContain("b");
  });
  it("résout les conflits Tailwind (dernier gagne)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});

describe("toUTCDate / formatDate (sûreté timezone)", () => {
  it("parse YYYY-MM-DD à minuit UTC (pas de décalage)", () => {
    const d = toUTCDate("2026-02-18");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(1); // février = 1
    expect(d.getUTCDate()).toBe(18);
    expect(d.toISOString()).toBe("2026-02-18T00:00:00.000Z");
  });
  it("formatDate est l'inverse de toUTCDate", () => {
    expect(formatDate(toUTCDate("2026-06-24"))).toBe("2026-06-24");
  });
});

describe("getWeekBounds (semaine lundi→dimanche)", () => {
  it("weekStart est toujours un lundi (UTC)", () => {
    for (const day of ["2026-06-22", "2026-06-24", "2026-06-28", "2026-01-01"]) {
      expect(getWeekBounds(day).weekStart.getUTCDay()).toBe(1); // 1 = lundi
    }
  });
  it("weekEnd = weekStart + 6 jours, fin de journée", () => {
    const { weekStart, weekEnd } = getWeekBounds("2026-06-24");
    // weekEnd est à 23:59:59.999 → ~6.9999 jours d'écart, donc floor = 6 jours civils.
    const diffDays = Math.floor((weekEnd.getTime() - weekStart.getTime()) / 86_400_000);
    expect(diffDays).toBe(6);
    expect(weekEnd.getUTCHours()).toBe(23);
    expect(weekEnd.getUTCMinutes()).toBe(59);
  });
  it("un dimanche est rattaché à la semaine qui le précède", () => {
    // dimanche → diff -6 → lundi 6 jours avant
    const { weekStart } = getWeekBounds("2026-06-28"); // supposé dimanche
    const { weekStart: monStart } = getWeekBounds("2026-06-22");
    if (toUTCDate("2026-06-28").getUTCDay() === 0) {
      expect(formatDate(weekStart)).toBe(formatDate(monStart));
    }
  });
});

describe("getWeekDays", () => {
  it("retourne 7 jours consécutifs à partir de l'entrée", () => {
    const days = getWeekDays("2026-06-22");
    expect(days).toHaveLength(7);
    expect(formatDate(days[0])).toBe("2026-06-22");
    expect(formatDate(days[6])).toBe("2026-06-28");
  });
});

describe("getDayNameFr", () => {
  it("mappe l'index → nom court FR (0=Lun)", () => {
    expect(getDayNameFr(0)).toBe("Lun");
    expect(getDayNameFr(6)).toBe("Dim");
    expect(getDayNameFr(7)).toBe(""); // hors borne
  });
});
