// Mock du singleton Prisma : findEligibleCandidates ne fait qu'UNE requete
// (storeEmployee.findMany) puis filtre/trie en memoire via des helpers purs
// deja testes (isAvailable, doTimesOverlap, calculateShiftHours).
jest.mock("@/lib/prisma", () => ({
  prisma: { storeEmployee: { findMany: jest.fn() } },
}));

import { findEligibleCandidates } from "@/lib/replacement";
import { prisma } from "@/lib/prisma";

// M116 / M013 — moteur de remplacement automatique : selection des candidats
// eligibles pour couvrir un shift libere par une absence.

const findMany = prisma.storeEmployee.findMany as jest.Mock;

// 2026-06-22 = lundi (dayOfWeek 1)
const SHIFT = {
  id: "sh1", storeId: "s1", date: new Date("2026-06-22T00:00:00Z"),
  startTime: "09:00", endTime: "14:00", employeeId: null,
};

type EmpShift = { date: Date; startTime: string; endTime: string };
type Unavail = { type: string; dayOfWeek: number | null; date: Date | null; startTime: string | null; endTime: string | null };

const emp = (o: Partial<{
  id: string; active: boolean; unavailabilities: Unavail[]; shifts: EmpShift[];
  maxHoursPerWeek: number; maxHoursPerDay: number; minRestBetween: number;
  weeklyHours: number; priority: number;
}> = {}) => ({
  employee: {
    id: "e1", active: true, unavailabilities: [], shifts: [],
    maxHoursPerWeek: 48, maxHoursPerDay: 11, minRestBetween: 11,
    weeklyHours: 35, priority: 1, ...o,
  },
});

beforeEach(() => findMany.mockReset());

describe("findEligibleCandidates", () => {
  it("retourne un employe actif, disponible et sans shift", async () => {
    findMany.mockResolvedValue([emp({ id: "e1" })]);
    const out = await findEligibleCandidates(SHIFT, "absent");
    expect(out).toEqual([{ employeeId: "e1", priority: 1, hoursRemaining: 35 }]);
  });

  it("exclut un employe inactif", async () => {
    findMany.mockResolvedValue([emp({ id: "e1", active: false })]);
    expect(await findEligibleCandidates(SHIFT, "absent")).toEqual([]);
  });

  it("exclut l'employe absent lui-meme", async () => {
    findMany.mockResolvedValue([emp({ id: "absent" })]);
    expect(await findEligibleCandidates(SHIFT, "absent")).toEqual([]);
  });

  it("exclut un employe indisponible (indispo FIXE chevauchante)", async () => {
    findMany.mockResolvedValue([
      emp({
        id: "e1",
        unavailabilities: [{ type: "FIXED", dayOfWeek: 1, date: null, startTime: "08:00", endTime: "15:00" }],
      }),
    ]);
    expect(await findEligibleCandidates(SHIFT, "absent")).toEqual([]);
  });

  it("exclut un employe avec un shift chevauchant le meme jour", async () => {
    findMany.mockResolvedValue([
      emp({ id: "e1", shifts: [{ date: new Date("2026-06-22T00:00:00Z"), startTime: "13:00", endTime: "17:00" }] }),
    ]);
    expect(await findEligibleCandidates(SHIFT, "absent")).toEqual([]);
  });

  it("exclut un employe qui depasserait son plafond hebdomadaire", async () => {
    findMany.mockResolvedValue([
      emp({
        id: "e1", maxHoursPerWeek: 8,
        // 5h le mardi (non chevauchant) ; +5h propose lundi = 10 > 8
        shifts: [{ date: new Date("2026-06-23T00:00:00Z"), startTime: "09:00", endTime: "14:00" }],
      }),
    ]);
    expect(await findEligibleCandidates(SHIFT, "absent")).toEqual([]);
  });

  it("trie par priorite (1=haute) puis heures restantes decroissantes", async () => {
    findMany.mockResolvedValue([
      emp({ id: "low", priority: 2 }),
      emp({ id: "high", priority: 1 }),
      emp({ id: "high2", priority: 1, weeklyHours: 40 }), // plus d'heures restantes
    ]);
    const out = await findEligibleCandidates(SHIFT, "absent");
    expect(out.map((c) => c.employeeId)).toEqual(["high2", "high", "low"]);
  });

  it("interroge bien le bon magasin", async () => {
    findMany.mockResolvedValue([]);
    await findEligibleCandidates(SHIFT, "absent");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: "s1" } })
    );
  });
});
