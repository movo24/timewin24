jest.mock("@/lib/prisma", () => ({
  prisma: {
    clockIn: { findMany: jest.fn() },
    shift: { findMany: jest.fn() },
    absenceDeclaration: { findMany: jest.fn() },
    replacementCandidate: { findMany: jest.fn() },
    shiftExchange: { findMany: jest.fn() },
    shiftMarketListing: { findMany: jest.fn() },
    employee: { findUnique: jest.fn() },
    managerAlert: { findMany: jest.fn() },
  },
}));

import { calculateReliabilityScore, deriveProfileCategory } from "@/lib/reliability-score";
import { prisma } from "@/lib/prisma";

// M116 / Manager Brain — score de fiabilite (0-100). Les 8 lectures Prisma sont
// batchees dans un Promise.all ; on les mocke pour verifier l'agregation
// (bornes par dimension, coherence score/profil, penalite de ponctualite).

function setData(o: {
  clockIns?: unknown[]; shifts?: unknown[]; absences?: unknown[];
  candidates?: unknown[]; exchanges?: unknown[]; listings?: unknown[];
  employee?: unknown; alerts?: unknown[];
} = {}) {
  (prisma.clockIn.findMany as jest.Mock).mockResolvedValue(o.clockIns ?? []);
  (prisma.shift.findMany as jest.Mock).mockResolvedValue(o.shifts ?? []);
  (prisma.absenceDeclaration.findMany as jest.Mock).mockResolvedValue(o.absences ?? []);
  (prisma.replacementCandidate.findMany as jest.Mock).mockResolvedValue(o.candidates ?? []);
  (prisma.shiftExchange.findMany as jest.Mock).mockResolvedValue(o.exchanges ?? []);
  (prisma.shiftMarketListing.findMany as jest.Mock).mockResolvedValue(o.listings ?? []);
  (prisma.employee.findUnique as jest.Mock).mockResolvedValue(o.employee ?? { skills: [] });
  (prisma.managerAlert.findMany as jest.Mock).mockResolvedValue(o.alerts ?? []);
}

describe("calculateReliabilityScore", () => {
  it("sans donnee : score borne et coherent avec le profil", async () => {
    setData();
    const r = await calculateReliabilityScore("e1");
    // score global dans [0,100]
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(Number.isNaN(r.score)).toBe(false);
    // chaque dimension dans sa borne documentee
    expect(r.punctualityScore).toBeLessThanOrEqual(20);
    expect(r.attendanceScore).toBeLessThanOrEqual(20);
    expect(r.autonomyScore).toBeLessThanOrEqual(15);
    expect(r.openCloseQualityScore).toBeLessThanOrEqual(10);
    expect(r.incidentScore).toBeLessThanOrEqual(10);
    expect(r.replacementScore).toBeLessThanOrEqual(10);
    expect(r.planningScore).toBeLessThanOrEqual(10);
    expect(r.transparencyScore).toBeLessThanOrEqual(5);
    // categorie coherente avec le seuil
    expect(r.profileCategory).toBe(deriveProfileCategory(r.score));
  });

  it("ponctualite parfaite (que des ON_TIME) -> 20/20", async () => {
    setData({
      clockIns: [
        { status: "ON_TIME", lateMinutes: 0, shiftId: "s1" },
        { status: "ON_TIME", lateMinutes: 0, shiftId: "s2" },
      ],
    });
    const r = await calculateReliabilityScore("e1");
    expect(r.punctualityScore).toBe(20);
    expect(r.metrics.onTimeCount).toBe(2);
    expect(r.metrics.lateCount).toBe(0);
  });

  it("un retard > 30 min -> penalite 3 -> ponctualite 17/20", async () => {
    setData({ clockIns: [{ status: "LATE", lateMinutes: 45, shiftId: "s1" }] });
    const r = await calculateReliabilityScore("e1");
    expect(r.punctualityScore).toBe(17);
    expect(r.metrics.lateCount).toBe(1);
    expect(r.metrics.latePenalty).toBe(3);
  });

  it("penalites de retard graduees (<=10 min = 1, <=30 = 2)", async () => {
    setData({
      clockIns: [
        { status: "LATE", lateMinutes: 5, shiftId: "s1" },   // +1
        { status: "LATE", lateMinutes: 20, shiftId: "s2" },  // +2
      ],
    });
    const r = await calculateReliabilityScore("e1");
    expect(r.metrics.latePenalty).toBe(3);
    expect(r.punctualityScore).toBe(17);
  });

  it("batch bien filtre sur l'employe demande", async () => {
    setData();
    await calculateReliabilityScore("emp-42");
    expect(prisma.clockIn.findMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ employeeId: "emp-42" }) })
    );
  });
});
