jest.mock("@/lib/prisma", () => ({ prisma: { employee: { findUnique: jest.fn() } } }));
jest.mock("@/lib/shifts", () => ({
  findOverlappingShift: jest.fn(),
  calculateWeeklyHours: jest.fn(),
}));

import { checkClaimConstraints } from "@/lib/marketplace";
import { prisma } from "@/lib/prisma";
import { findOverlappingShift, calculateWeeklyHours } from "@/lib/shifts";

// M116 / marketplace — verification des contraintes dures avant qu'un employe
// puisse reclamer un shift : disponibilite, chevauchement, plafonds hebdo/jour,
// repos minimum. Retourne le detail de chaque verification.

const findUnique = prisma.employee.findUnique as jest.Mock;
const overlap = findOverlappingShift as jest.Mock;
const weekly = calculateWeeklyHours as jest.Mock;

const SHIFT = { id: "sh1", date: new Date("2026-06-22T00:00:00Z"), startTime: "09:00", endTime: "14:00" }; // 5h, lundi

const emp = (o: Partial<{ unavailabilities: unknown[]; shifts: unknown[]; maxHoursPerWeek: number; maxHoursPerDay: number; minRestBetween: number }> = {}) => ({
  id: "e1", maxHoursPerWeek: 48, maxHoursPerDay: 11, minRestBetween: 11,
  unavailabilities: o.unavailabilities ?? [], shifts: o.shifts ?? [], ...o,
});

beforeEach(() => {
  findUnique.mockReset();
  overlap.mockReset().mockResolvedValue(null);
  weekly.mockReset().mockResolvedValue(0);
});

describe("checkClaimConstraints", () => {
  it("employe introuvable -> inéligible, tout en echec", async () => {
    findUnique.mockResolvedValue(null);
    const r = await checkClaimConstraints("e1", SHIFT);
    expect(r.eligible).toBe(false);
    expect(r).toMatchObject({ overlapOk: false, weeklyHoursOk: false, restOk: false, availabilityOk: false });
    expect(r.details.shiftHours).toBe(5);
  });

  it("toutes contraintes OK -> eligible", async () => {
    findUnique.mockResolvedValue(emp());
    const r = await checkClaimConstraints("e1", SHIFT);
    expect(r.eligible).toBe(true);
    expect(r).toMatchObject({ overlapOk: true, weeklyHoursOk: true, dailyHoursOk: true, restOk: true, availabilityOk: true });
    expect(r.details).toMatchObject({ currentWeeklyHours: 0, shiftHours: 5, maxWeeklyHours: 48, currentDailyHours: 0, maxDailyHours: 11 });
  });

  it("plafond hebdomadaire depasse -> weeklyHoursOk false", async () => {
    findUnique.mockResolvedValue(emp());
    weekly.mockResolvedValue(46); // 46 + 5 = 51 > 48
    const r = await checkClaimConstraints("e1", SHIFT);
    expect(r.weeklyHoursOk).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("chevauchement detecte -> overlapOk false", async () => {
    findUnique.mockResolvedValue(emp());
    overlap.mockResolvedValue({ id: "other" });
    const r = await checkClaimConstraints("e1", SHIFT);
    expect(r.overlapOk).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("indisponibilite FIXE chevauchante -> availabilityOk false", async () => {
    findUnique.mockResolvedValue(emp({
      unavailabilities: [{ type: "FIXED", dayOfWeek: 1, date: null, startTime: "08:00", endTime: "15:00" }],
    }));
    const r = await checkClaimConstraints("e1", SHIFT);
    expect(r.availabilityOk).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("plafond journalier depasse -> dailyHoursOk false", async () => {
    findUnique.mockResolvedValue(emp({
      shifts: [{ date: new Date("2026-06-22T00:00:00Z"), startTime: "08:00", endTime: "16:00" }], // 8h + 5 = 13 > 11
    }));
    const r = await checkClaimConstraints("e1", SHIFT);
    expect(r.dailyHoursOk).toBe(false);
    expect(r.eligible).toBe(false);
  });

  it("repos insuffisant entre shifts -> restOk false", async () => {
    findUnique.mockResolvedValue(emp({
      shifts: [{ date: new Date("2026-06-22T00:00:00Z"), startTime: "14:30", endTime: "18:00" }], // 30 min apres -> < 11h
    }));
    const r = await checkClaimConstraints("e1", SHIFT);
    expect(r.restOk).toBe(false);
    expect(r.eligible).toBe(false);
  });
});
