jest.mock("@/lib/prisma", () => ({ prisma: { shift: { findMany: jest.fn() } } }));

import { findOverlappingShift, calculateWeeklyHours } from "@/lib/shifts";
import { prisma } from "@/lib/prisma";

// M116 / shifts — helpers fondamentaux reutilises par replacement/marketplace/
// solveur : detection de chevauchement et somme des heures hebdomadaires.

const findMany = prisma.shift.findMany as jest.Mock;
const D = (d: string) => new Date(d + "T00:00:00Z");

beforeEach(() => findMany.mockReset());

describe("findOverlappingShift", () => {
  it("employe non assigne -> null sans requete", async () => {
    expect(await findOverlappingShift(null, "2026-06-22", "09:00", "14:00")).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("retourne le shift chevauchant", async () => {
    findMany.mockResolvedValue([{ id: "x", date: D("2026-06-22"), startTime: "13:00", endTime: "17:00", store: {} }]);
    const r = await findOverlappingShift("e1", "2026-06-22", "09:00", "14:00");
    expect(r).not.toBeNull();
    expect(r!.id).toBe("x");
  });

  it("aucun chevauchement -> null", async () => {
    findMany.mockResolvedValue([{ id: "x", date: D("2026-06-22"), startTime: "15:00", endTime: "18:00", store: {} }]);
    expect(await findOverlappingShift("e1", "2026-06-22", "09:00", "14:00")).toBeNull();
  });
});

describe("calculateWeeklyHours", () => {
  it("employe non assigne -> 0 sans requete", async () => {
    expect(await calculateWeeklyHours(null, D("2026-06-22"), D("2026-06-28"))).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("somme les heures de tous les shifts de la semaine", async () => {
    findMany.mockResolvedValue([
      { startTime: "09:00", endTime: "14:00" }, // 5h
      { startTime: "10:00", endTime: "12:00" }, // 2h
    ]);
    expect(await calculateWeeklyHours("e1", D("2026-06-22"), D("2026-06-28"))).toBe(7);
  });

  it("aucun shift -> 0", async () => {
    findMany.mockResolvedValue([]);
    expect(await calculateWeeklyHours("e1", D("2026-06-22"), D("2026-06-28"))).toBe(0);
  });
});
