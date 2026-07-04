jest.mock("@/lib/prisma", () => ({ prisma: { clockIn: { findMany: jest.fn() } } }));

import { detectSignificantLateness } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";

// M116 / alertes manager — retard significatif (> 15 min) : WARNING, ou
// CRITICAL au-dela de 30 min. Une requete clockIn puis mapping pur.

const findMany = prisma.clockIn.findMany as jest.Mock;
const DATE = "2026-06-22";

const lateClockIn = (lateMinutes: number, o: Partial<{ id: string }> = {}) => ({
  id: o.id ?? "ci1", storeId: "s1", employeeId: "e1", lateMinutes,
  clockInAt: new Date("2026-06-22T09:25:00Z"),
  employee: { firstName: "Alice", lastName: "Martin" },
  store: { id: "s1", name: "Wesley" },
  shift: { id: "sh1", startTime: "09:00", endTime: "17:00" },
});

beforeEach(() => findMany.mockReset());

describe("detectSignificantLateness", () => {
  it("aucun retard -> []", async () => {
    findMany.mockResolvedValue([]);
    expect(await detectSignificantLateness(DATE)).toEqual([]);
  });

  it("retard <= 30 min -> WARNING", async () => {
    findMany.mockResolvedValue([lateClockIn(20)]);
    const [a] = await detectSignificantLateness(DATE);
    expect(a.type).toBe("SIGNIFICANT_LATENESS");
    expect(a.severity).toBe("WARNING");
  });

  it("retard > 30 min -> CRITICAL", async () => {
    findMany.mockResolvedValue([lateClockIn(45)]);
    const [a] = await detectSignificantLateness(DATE);
    expect(a.severity).toBe("CRITICAL");
  });

  it("mappe correctement titre, heure et details", async () => {
    findMany.mockResolvedValue([lateClockIn(45, { id: "ciX" })]);
    const [a] = await detectSignificantLateness(DATE);
    expect(a.time).toBe("09:25"); // derive de clockInAt
    expect(a.title).toContain("45 min");
    expect(a.title).toContain("Alice Martin");
    expect(a.contextKey).toBe("ciX");
    expect(a.details).toMatchObject({
      employeeId: "e1", employeeName: "Alice Martin", lateMinutes: 45,
      shiftStartTime: "09:00", storeName: "Wesley",
    });
  });

  it("filtre bien sur la journee demandee", async () => {
    findMany.mockResolvedValue([]);
    await detectSignificantLateness(DATE);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "LATE", lateMinutes: { gt: 15 } }) })
    );
  });
});
