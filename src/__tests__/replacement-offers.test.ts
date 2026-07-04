jest.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findMany: jest.fn(), update: jest.fn() },
    replacementOffer: { create: jest.fn() },
    storeEmployee: { findMany: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createReplacementOffers } from "@/lib/replacement";
import { prisma } from "@/lib/prisma";

// M116 / M013 — orchestration du moteur de remplacement : a partir d'une
// absence approuvee, desassigner les shifts touches et creer des offres de
// remplacement (sauf si deja expirees ou sans candidat).

const shiftFindMany = prisma.shift.findMany as jest.Mock;
const shiftUpdate = prisma.shift.update as jest.Mock;
const offerCreate = prisma.replacementOffer.create as jest.Mock;
const storeEmpFindMany = prisma.storeEmployee.findMany as jest.Mock;

const ABSENCE = { id: "abs1", employeeId: "absent", startDate: new Date("2026-06-20"), endDate: new Date("2026-06-30") };

const futureShift = () => ({
  id: "sh1", storeId: "s1",
  date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // dans 2 jours
  startTime: "09:00", endTime: "14:00",
});

const pastShift = () => ({
  id: "shp", storeId: "s1",
  date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // il y a 2 jours
  startTime: "09:00", endTime: "14:00",
});

const eligibleCandidate = () => ({
  employee: {
    id: "cand", active: true, unavailabilities: [], shifts: [],
    maxHoursPerWeek: 48, maxHoursPerDay: 11, minRestBetween: 11,
    weeklyHours: 35, priority: 1,
  },
});

beforeEach(() => {
  shiftFindMany.mockReset();
  shiftUpdate.mockReset().mockResolvedValue({});
  offerCreate.mockReset().mockResolvedValue({});
  storeEmpFindMany.mockReset().mockResolvedValue([]);
});

describe("createReplacementOffers", () => {
  it("aucun shift affecte -> 0 offre, aucune ecriture", async () => {
    shiftFindMany.mockResolvedValue([]);
    expect(await createReplacementOffers(ABSENCE)).toBe(0);
    expect(shiftUpdate).not.toHaveBeenCalled();
    expect(offerCreate).not.toHaveBeenCalled();
  });

  it("shift futur avec candidat -> desassigne + cree l'offre", async () => {
    shiftFindMany.mockResolvedValue([futureShift()]);
    storeEmpFindMany.mockResolvedValue([eligibleCandidate()]);
    const n = await createReplacementOffers(ABSENCE);
    expect(n).toBe(1);
    // desassignation (employeeId: null)
    expect(shiftUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sh1" }, data: expect.objectContaining({ employeeId: null }) })
    );
    // offre creee avec le candidat
    expect(offerCreate).toHaveBeenCalledTimes(1);
    const arg = offerCreate.mock.calls[0][0];
    expect(arg.data.shiftId).toBe("sh1");
    expect(arg.data.absentEmployeeId).toBe("absent");
    expect(arg.data.candidates.create).toEqual([{ employeeId: "cand" }]);
  });

  it("shift deja expire -> desassigne mais pas d'offre", async () => {
    shiftFindMany.mockResolvedValue([pastShift()]);
    const n = await createReplacementOffers(ABSENCE);
    expect(n).toBe(0);
    expect(shiftUpdate).toHaveBeenCalledTimes(1); // desassignation faite
    expect(offerCreate).not.toHaveBeenCalled();   // mais offre expiree -> skip
  });

  it("shift futur sans candidat -> desassigne mais pas d'offre", async () => {
    shiftFindMany.mockResolvedValue([futureShift()]);
    storeEmpFindMany.mockResolvedValue([]); // aucun candidat eligible
    const n = await createReplacementOffers(ABSENCE);
    expect(n).toBe(0);
    expect(shiftUpdate).toHaveBeenCalledTimes(1);
    expect(offerCreate).not.toHaveBeenCalled();
  });
});
