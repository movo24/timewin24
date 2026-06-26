import { intervalHours, isSunday, dayOfWeek } from "@/lib/payroll/hours";
import { qualifyWeeklyHours, weekStart } from "@/lib/payroll/qualify";

// Paie / Étage 2 — heures + qualification hebdomadaire (seuils legaux).
// Aucune valorisation : on compte et on classe, on ne majore pas.

describe("intervalHours", () => {
  it("calcule une duree simple", () => {
    expect(intervalHours("09:00", "17:00")).toBe(8);
    expect(intervalHours("09:00", "12:30")).toBe(3.5);
  });
  it("gere le passage de minuit", () => {
    expect(intervalHours("22:00", "06:00")).toBe(8);
  });
});

describe("isSunday / dayOfWeek", () => {
  it("detecte le dimanche", () => {
    expect(isSunday("2026-06-21")).toBe(true); // dimanche
    expect(isSunday("2026-06-22")).toBe(false); // lundi
    expect(dayOfWeek("2026-06-22")).toBe(1);
  });
});

describe("weekStart", () => {
  it("ramene au lundi de la semaine", () => {
    expect(weekStart("2026-06-24")).toBe("2026-06-22"); // mercredi -> lundi
    expect(weekStart("2026-06-22")).toBe("2026-06-22"); // lundi -> lui-meme
    expect(weekStart("2026-06-21")).toBe("2026-06-15"); // dimanche -> lundi precedent
  });
});

describe("qualifyWeeklyHours — temps plein (35h)", () => {
  it("sous le seuil : tout en normal", () => {
    expect(qualifyWeeklyHours(30, 35)).toEqual({ normalHours: 30, overtimeHours: 0, complementaryHours: 0 });
  });
  it("au seuil exact : tout en normal", () => {
    expect(qualifyWeeklyHours(35, 35)).toEqual({ normalHours: 35, overtimeHours: 0, complementaryHours: 0 });
  });
  it("au-dela : heures supplementaires", () => {
    expect(qualifyWeeklyHours(42, 35)).toEqual({ normalHours: 35, overtimeHours: 7, complementaryHours: 0 });
  });
});

describe("qualifyWeeklyHours — temps partiel (24h)", () => {
  it("sous le contrat : tout en normal", () => {
    expect(qualifyWeeklyHours(20, 24)).toEqual({ normalHours: 20, overtimeHours: 0, complementaryHours: 0 });
  });
  it("entre contrat et seuil legal : heures complementaires", () => {
    expect(qualifyWeeklyHours(30, 24)).toEqual({ normalHours: 24, overtimeHours: 0, complementaryHours: 6 });
  });
  it("au-dela du seuil legal : complementaires plafonnees + heures sup", () => {
    // 24 normal + (35-24)=11 complementaires + (38-35)=3 sup
    expect(qualifyWeeklyHours(38, 24)).toEqual({ normalHours: 24, overtimeHours: 3, complementaryHours: 11 });
  });
});
