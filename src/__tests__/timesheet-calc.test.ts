/**
 * Tests unitaires des fonctions pures de calcul Timesheet.
 *
 * Aucun setup DB ou réseau. Tout est testable en isolation.
 * Couvre : happy path + cas limites + données invalides.
 */
import {
  parseHHMM,
  computeShiftMinutes,
  estimateBreakMinutes,
  computeWorkedMinutes,
  daysOverlap,
  getISOWeekStart,
  getISOWeekEnd,
  overtimeForWeek,
  estimateGrossCost,
  formatMinutesAsHours,
} from "@/lib/timesheet/calc";

// ─── parseHHMM ──────────────────────────────────────────────────────────────

describe("parseHHMM", () => {
  it("parse '00:00' -> 0", () => {
    expect(parseHHMM("00:00")).toBe(0);
  });

  it("parse '09:30' -> 570", () => {
    expect(parseHHMM("09:30")).toBe(570);
  });

  it("parse '9:30' (heure 1 chiffre) -> 570", () => {
    expect(parseHHMM("9:30")).toBe(570);
  });

  it("parse '17:30' -> 1050", () => {
    expect(parseHHMM("17:30")).toBe(1050);
  });

  it("parse '23:59' -> 1439", () => {
    expect(parseHHMM("23:59")).toBe(1439);
  });

  it("parse '24:00' (fin de journee canonique) -> 1440", () => {
    expect(parseHHMM("24:00")).toBe(1440);
  });

  it("parse '24:01' (heure 24 + minutes != 0) -> NaN", () => {
    expect(parseHHMM("24:01")).toBeNaN();
  });

  it("parse '25:00' -> NaN", () => {
    expect(parseHHMM("25:00")).toBeNaN();
  });

  it("parse '12:60' -> NaN", () => {
    expect(parseHHMM("12:60")).toBeNaN();
  });

  it("parse format invalide '1230' -> NaN", () => {
    expect(parseHHMM("1230")).toBeNaN();
  });

  it("parse vide -> NaN", () => {
    expect(parseHHMM("")).toBeNaN();
  });

  it("parse non-string -> NaN", () => {
    expect(parseHHMM(null)).toBeNaN();
    expect(parseHHMM(undefined)).toBeNaN();
    expect(parseHHMM(900)).toBeNaN();
  });
});

// ─── computeShiftMinutes ────────────────────────────────────────────────────

describe("computeShiftMinutes", () => {
  it("'09:00' -> '17:30' = 510 (8h30)", () => {
    expect(computeShiftMinutes("09:00", "17:30")).toBe(510);
  });

  it("'09:00' -> '17:00' = 480 (8h)", () => {
    expect(computeShiftMinutes("09:00", "17:00")).toBe(480);
  });

  it("'22:00' -> '06:00' = 480 (8h cross-midnight)", () => {
    expect(computeShiftMinutes("22:00", "06:00")).toBe(480);
  });

  it("'23:00' -> '01:00' = 120 (2h cross-midnight)", () => {
    expect(computeShiftMinutes("23:00", "01:00")).toBe(120);
  });

  it("'09:00' -> '09:00' = 0 (cas degenere, pas une erreur)", () => {
    expect(computeShiftMinutes("09:00", "09:00")).toBe(0);
  });

  it("'00:00' -> '00:00' = 0 (cas degenere midnight)", () => {
    expect(computeShiftMinutes("00:00", "00:00")).toBe(0);
  });

  it("'00:00' -> '24:00' = 1440 (journee complete canonique)", () => {
    expect(computeShiftMinutes("00:00", "24:00")).toBe(1440);
  });

  it("Format invalide -> 0 (sans crash)", () => {
    expect(computeShiftMinutes("invalid", "17:00")).toBe(0);
    expect(computeShiftMinutes("09:00", "")).toBe(0);
    expect(computeShiftMinutes("aa:bb", "cc:dd")).toBe(0);
  });
});

// ─── estimateBreakMinutes ───────────────────────────────────────────────────

describe("estimateBreakMinutes", () => {
  it("Shift de 6h pile -> 0 (pas au-dessus du seuil)", () => {
    expect(estimateBreakMinutes(360)).toBe(0);
  });

  it("Shift de 6h01 -> 30 (juste au-dessus)", () => {
    expect(estimateBreakMinutes(361)).toBe(30);
  });

  it("Shift de 8h30 -> 30", () => {
    expect(estimateBreakMinutes(510)).toBe(30);
  });

  it("Shift de 4h -> 0", () => {
    expect(estimateBreakMinutes(240)).toBe(0);
  });

  it("Shift de 0 min -> 0", () => {
    expect(estimateBreakMinutes(0)).toBe(0);
  });

  it("Shift negatif -> 0 (garde-fou)", () => {
    expect(estimateBreakMinutes(-10)).toBe(0);
  });

  it("Shift Infinity -> 0 (garde-fou)", () => {
    expect(estimateBreakMinutes(Infinity)).toBe(0);
  });

  it("Shift NaN -> 0", () => {
    expect(estimateBreakMinutes(NaN)).toBe(0);
  });
});

// ─── computeWorkedMinutes ───────────────────────────────────────────────────

describe("computeWorkedMinutes", () => {
  const T = (iso: string) => new Date(iso);

  it("Shift normal 09:00 -> 17:30 = 510 min", () => {
    const r = computeWorkedMinutes(
      T("2026-05-13T09:00:00Z"),
      T("2026-05-13T17:30:00Z"),
    );
    expect(r.worked).toBe(510);
    expect(r.inProgress).toBe(false);
    expect(r.capped).toBe(false);
  });

  it("clockOutAt null -> worked=0, inProgress=true", () => {
    const r = computeWorkedMinutes(T("2026-05-13T09:00:00Z"), null);
    expect(r.worked).toBe(0);
    expect(r.inProgress).toBe(true);
    expect(r.capped).toBe(false);
  });

  it("clockOut avant clockIn (anomalie) -> worked=0, inProgress=false", () => {
    const r = computeWorkedMinutes(
      T("2026-05-13T17:00:00Z"),
      T("2026-05-13T09:00:00Z"),
    );
    expect(r.worked).toBe(0);
    expect(r.inProgress).toBe(false);
  });

  it("clockOut = clockIn -> worked=0", () => {
    const r = computeWorkedMinutes(
      T("2026-05-13T09:00:00Z"),
      T("2026-05-13T09:00:00Z"),
    );
    expect(r.worked).toBe(0);
  });

  it("Pointage qui dure 25h -> cap a 1440, capped=true", () => {
    const r = computeWorkedMinutes(
      T("2026-05-13T09:00:00Z"),
      T("2026-05-14T10:00:00Z"), // 25h
    );
    expect(r.worked).toBe(1440);
    expect(r.capped).toBe(true);
    expect(r.inProgress).toBe(false);
  });

  it("Pointage exactement 24h -> 1440, capped=false", () => {
    const r = computeWorkedMinutes(
      T("2026-05-13T09:00:00Z"),
      T("2026-05-14T09:00:00Z"),
    );
    expect(r.worked).toBe(1440);
    expect(r.capped).toBe(false);
  });

  it("Cross-midnight 22:00 -> 06:00 le lendemain = 480", () => {
    const r = computeWorkedMinutes(
      T("2026-05-13T22:00:00Z"),
      T("2026-05-14T06:00:00Z"),
    );
    expect(r.worked).toBe(480);
  });

  it("Quelques secondes (< 1 min) -> 0 (floor)", () => {
    const r = computeWorkedMinutes(
      T("2026-05-13T09:00:00Z"),
      T("2026-05-13T09:00:30Z"),
    );
    expect(r.worked).toBe(0);
  });
});

// ─── daysOverlap ────────────────────────────────────────────────────────────

describe("daysOverlap", () => {
  const D = (iso: string) => new Date(iso + "T00:00:00Z");

  it("Periodes identiques (1 jour) -> 1", () => {
    expect(
      daysOverlap(D("2026-05-13"), D("2026-05-13"), D("2026-05-13"), D("2026-05-13")),
    ).toBe(1);
  });

  it("Absence 5 jours dans une semaine de 7 -> 5", () => {
    expect(
      daysOverlap(D("2026-05-11"), D("2026-05-17"), D("2026-05-12"), D("2026-05-16")),
    ).toBe(5);
  });

  it("Absence avant la fenetre -> 0", () => {
    expect(
      daysOverlap(D("2026-05-11"), D("2026-05-17"), D("2026-05-01"), D("2026-05-05")),
    ).toBe(0);
  });

  it("Absence apres la fenetre -> 0", () => {
    expect(
      daysOverlap(D("2026-05-11"), D("2026-05-17"), D("2026-05-20"), D("2026-05-25")),
    ).toBe(0);
  });

  it("Absence debutant avant la fenetre -> compte jours dans la fenetre", () => {
    expect(
      daysOverlap(D("2026-05-11"), D("2026-05-17"), D("2026-05-09"), D("2026-05-13")),
    ).toBe(3); // 11, 12, 13
  });

  it("Absence terminant apres la fenetre -> compte jours dans la fenetre", () => {
    expect(
      daysOverlap(D("2026-05-11"), D("2026-05-17"), D("2026-05-15"), D("2026-05-25")),
    ).toBe(3); // 15, 16, 17
  });

  it("Absence englobant entierement la fenetre -> taille fenetre", () => {
    expect(
      daysOverlap(D("2026-05-11"), D("2026-05-17"), D("2026-05-01"), D("2026-05-30")),
    ).toBe(7);
  });
});

// ─── getISOWeekStart / getISOWeekEnd ────────────────────────────────────────

describe("getISOWeekStart", () => {
  const D = (iso: string) => new Date(iso + "T00:00:00Z");

  it("Mercredi 2026-05-13 -> Lundi 2026-05-11", () => {
    expect(getISOWeekStart(D("2026-05-13")).toISOString()).toBe(
      "2026-05-11T00:00:00.000Z",
    );
  });

  it("Lundi 2026-05-11 (deja lundi) -> lui-meme", () => {
    expect(getISOWeekStart(D("2026-05-11")).toISOString()).toBe(
      "2026-05-11T00:00:00.000Z",
    );
  });

  it("Dimanche 2026-05-17 -> Lundi 2026-05-11 (fin de semaine ISO)", () => {
    expect(getISOWeekStart(D("2026-05-17")).toISOString()).toBe(
      "2026-05-11T00:00:00.000Z",
    );
  });

  it("Samedi 2026-05-16 -> Lundi 2026-05-11", () => {
    expect(getISOWeekStart(D("2026-05-16")).toISOString()).toBe(
      "2026-05-11T00:00:00.000Z",
    );
  });

  it("Idempotence : appliquer 2x donne le meme resultat", () => {
    const wed = D("2026-05-13");
    const once = getISOWeekStart(wed);
    const twice = getISOWeekStart(once);
    expect(twice.toISOString()).toBe(once.toISOString());
  });

  it("Ne mute pas l'input", () => {
    const original = D("2026-05-13");
    const originalTime = original.getTime();
    getISOWeekStart(original);
    expect(original.getTime()).toBe(originalTime);
  });
});

describe("getISOWeekEnd", () => {
  const D = (iso: string) => new Date(iso + "T00:00:00Z");

  it("Mercredi 2026-05-13 -> Dimanche 2026-05-17", () => {
    expect(getISOWeekEnd(D("2026-05-13")).toISOString()).toBe(
      "2026-05-17T00:00:00.000Z",
    );
  });

  it("Difference entre start et end = 6 jours exactement", () => {
    const wed = D("2026-05-13");
    const start = getISOWeekStart(wed);
    const end = getISOWeekEnd(wed);
    const diff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(diff).toBe(6);
  });
});

// ─── overtimeForWeek ────────────────────────────────────────────────────────

describe("overtimeForWeek", () => {
  it("42h pointees, 35h contrat -> 420 min (7h sup)", () => {
    expect(overtimeForWeek(42 * 60, 35)).toBe(7 * 60);
  });

  it("30h pointees, 35h contrat -> 0", () => {
    expect(overtimeForWeek(30 * 60, 35)).toBe(0);
  });

  it("35h pointees, 35h contrat (pile) -> 0", () => {
    expect(overtimeForWeek(35 * 60, 35)).toBe(0);
  });

  it("weeklyHours null -> 0 (pas calculable)", () => {
    expect(overtimeForWeek(40 * 60, null)).toBe(0);
  });

  it("weeklyHours 0 -> 0", () => {
    expect(overtimeForWeek(40 * 60, 0)).toBe(0);
  });

  it("weeklyHours negatif -> 0 (garde-fou)", () => {
    expect(overtimeForWeek(40 * 60, -5)).toBe(0);
  });

  it("workedMinutes negatif -> 0 (garde-fou)", () => {
    expect(overtimeForWeek(-100, 35)).toBe(0);
  });

  it("Contrat temps partiel 20h, pointage 25h -> 300 min sup", () => {
    expect(overtimeForWeek(25 * 60, 20)).toBe(5 * 60);
  });
});

// ─── estimateGrossCost ──────────────────────────────────────────────────────

describe("estimateGrossCost", () => {
  it("510 min (8.5h) a 12 EUR/h -> 102.00", () => {
    expect(estimateGrossCost(510, 12)).toBe(102);
  });

  it("60 min a 11.88 EUR/h -> 11.88", () => {
    expect(estimateGrossCost(60, 11.88)).toBe(11.88);
  });

  it("hourlyRateGross null -> null (pas configure)", () => {
    expect(estimateGrossCost(510, null)).toBeNull();
  });

  it("hourlyRateGross negatif -> null (corruption)", () => {
    expect(estimateGrossCost(510, -10)).toBeNull();
  });

  it("workedMinutes 0 + taux valide -> 0", () => {
    expect(estimateGrossCost(0, 12)).toBe(0);
  });

  it("workedMinutes negatif -> 0", () => {
    expect(estimateGrossCost(-50, 12)).toBe(0);
  });

  it("Arrondi 2 decimales (1.005 -> 1.00 ou 1.01 selon implementation)", () => {
    // 7 min a 10 EUR/h = 7/60 * 10 = 1.1666... -> 1.17
    expect(estimateGrossCost(7, 10)).toBe(1.17);
  });

  it("Tres gros volume : 40h a 15 EUR/h = 600.00", () => {
    expect(estimateGrossCost(40 * 60, 15)).toBe(600);
  });
});

// ─── formatMinutesAsHours ───────────────────────────────────────────────────

describe("formatMinutesAsHours", () => {
  it("510 -> '8h30'", () => {
    expect(formatMinutesAsHours(510)).toBe("8h30");
  });

  it("60 -> '1h00'", () => {
    expect(formatMinutesAsHours(60)).toBe("1h00");
  });

  it("5 -> '0h05' (padding zero minutes)", () => {
    expect(formatMinutesAsHours(5)).toBe("0h05");
  });

  it("0 -> '0h00'", () => {
    expect(formatMinutesAsHours(0)).toBe("0h00");
  });

  it("1440 (24h) -> '24h00'", () => {
    expect(formatMinutesAsHours(1440)).toBe("24h00");
  });

  it("Negatif -> '0h00' (garde-fou)", () => {
    expect(formatMinutesAsHours(-10)).toBe("0h00");
  });

  it("NaN -> '0h00'", () => {
    expect(formatMinutesAsHours(NaN)).toBe("0h00");
  });
});
