jest.mock("@/lib/prisma", () => ({
  prisma: {
    storeSchedule: { findMany: jest.fn() },
    clockIn: { findFirst: jest.fn() },
  },
}));

import { parseTime, detectStoreNotOpened } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";

// M116 / alertes manager — detection "magasin non ouvert" : un magasin qui
// devait ouvrir (openTime + 15 min depasse) sans aucun pointage -> CRITICAL.

const schedFindMany = prisma.storeSchedule.findMany as jest.Mock;
const clockFindFirst = prisma.clockIn.findFirst as jest.Mock;

const DATE = "2026-06-22"; // lundi
const schedule = (openTime: string) => ({
  storeId: "s1", openTime, store: { id: "s1", name: "Wesley Centre" },
});

describe("parseTime", () => {
  it("convertit HH:mm en minutes depuis minuit", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("23:59")).toBe(1439);
  });
});

describe("detectStoreNotOpened", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-22T12:00:00Z")); // 720 min
    schedFindMany.mockReset();
    clockFindFirst.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it("magasin ouvert ce matin sans pointage -> alerte CRITICAL", async () => {
    schedFindMany.mockResolvedValue([schedule("08:00")]); // 480 + 15 = 495 < 720
    clockFindFirst.mockResolvedValue(null);
    const alerts = await detectStoreNotOpened(DATE);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: "STORE_NOT_OPENED", severity: "CRITICAL", storeId: "s1", time: "08:00",
    });
  });

  it("magasin avec un pointage -> pas d'alerte", async () => {
    schedFindMany.mockResolvedValue([schedule("08:00")]);
    clockFindFirst.mockResolvedValue({ id: "c1" });
    expect(await detectStoreNotOpened(DATE)).toEqual([]);
  });

  it("ouverture encore a venir (< openTime + 15 min) -> ignore, pas de requete pointage", async () => {
    schedFindMany.mockResolvedValue([schedule("13:00")]); // 780 + 15 = 795 > 720
    const alerts = await detectStoreNotOpened(DATE);
    expect(alerts).toEqual([]);
    expect(clockFindFirst).not.toHaveBeenCalled();
  });

  it("aucun horaire d'ouverture ce jour -> []", async () => {
    schedFindMany.mockResolvedValue([]);
    expect(await detectStoreNotOpened(DATE)).toEqual([]);
  });
});
