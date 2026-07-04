jest.mock("@/lib/prisma", () => ({
  prisma: { shift: { findFirst: jest.fn() }, posTimeClock: { upsert: jest.fn() } },
}));

import { syncTimeClocks } from "@/lib/pos/sync-engine";
import { prisma } from "@/lib/prisma";
import type { PosAdapter } from "@/lib/pos/adapter";
import type { PosTimeClockEntry, PosDateRange } from "@/lib/pos/types";

// M116 / POS — import des pointages POS -> TimeWin. Regles TimeWin24 :
// idempotence (upsert sur providerId+posRecordId, jamais de doublon) et
// classification du delta vs planning (on_time / late / early / extra).

const shiftFindFirst = prisma.shift.findFirst as jest.Mock;
const tcUpsert = prisma.posTimeClock.upsert as jest.Mock;

const RANGE: PosDateRange = { from: "2026-06-22", to: "2026-06-22" };
const PROVIDER = {
  id: "prov1",
  storeLinks: [{ storeId: "s1", posStoreId: "POS-S1" }],
  employeeLinks: [{ employeeId: "e1", posEmployeeId: "POS-E1" }],
};

const entry = (o: Partial<PosTimeClockEntry> = {}): PosTimeClockEntry => ({
  posRecordId: "rec1", posEmployeeId: "POS-E1", posStoreId: "POS-S1",
  date: "2026-06-22", clockIn: "09:00", clockOut: "17:00", breakMinutes: 30, ...o,
});

const adapterWith = (entries: PosTimeClockEntry[]) =>
  ({ fetchTimeClocks: jest.fn().mockResolvedValue(entries) } as unknown as PosAdapter);

beforeEach(() => {
  shiftFindFirst.mockReset().mockResolvedValue(null);
  tcUpsert.mockReset().mockResolvedValue({});
});

describe("syncTimeClocks", () => {
  it("ignore une entree dont le magasin/employe n'est pas mappe (pas d'upsert)", async () => {
    const r = await syncTimeClocks(adapterWith([entry({ posStoreId: "INCONNU" })]), PROVIDER, RANGE);
    expect(r.skipped).toBe(1);
    expect(r.created).toBe(0);
    expect(tcUpsert).not.toHaveBeenCalled();
  });

  it("upsert idempotent sur providerId + posRecordId (anti-doublon)", async () => {
    await syncTimeClocks(adapterWith([entry({ posRecordId: "rec42" })]), PROVIDER, RANGE);
    expect(tcUpsert).toHaveBeenCalledTimes(1);
    const arg = tcUpsert.mock.calls[0][0];
    expect(arg.where).toEqual({ providerId_posRecordId: { providerId: "prov1", posRecordId: "rec42" } });
    // l'employe/magasin POS sont resolus vers les ids TimeWin
    expect(arg.create).toMatchObject({ employeeId: "e1", storeId: "s1" });
  });

  it("calcule workedHours (clockOut - clockIn - pause)", async () => {
    await syncTimeClocks(adapterWith([entry({ clockIn: "09:00", clockOut: "17:00", breakMinutes: 30 })]), PROVIDER, RANGE);
    // 8h - 30min = 7.5h
    expect(tcUpsert.mock.calls[0][0].create.workedHours).toBe(7.5);
  });

  it("sans shift planifie -> status 'extra' (heure sup)", async () => {
    await syncTimeClocks(adapterWith([entry()]), PROVIDER, RANGE);
    expect(tcUpsert.mock.calls[0][0].create.status).toBe("extra");
    expect(tcUpsert.mock.calls[0][0].create.deltaMinutes).toBeNull();
  });

  it("pointage a l'heure (<=5 min) -> status 'on_time'", async () => {
    shiftFindFirst.mockResolvedValue({ id: "sh1", startTime: "09:00" });
    await syncTimeClocks(adapterWith([entry({ clockIn: "09:03" })]), PROVIDER, RANGE);
    const c = tcUpsert.mock.calls[0][0].create;
    expect(c.status).toBe("on_time");
    expect(c.deltaMinutes).toBe(3);
    expect(c.shiftId).toBe("sh1");
  });

  it("pointage en retard (> 5 min) -> status 'late'", async () => {
    shiftFindFirst.mockResolvedValue({ id: "sh1", startTime: "09:00" });
    await syncTimeClocks(adapterWith([entry({ clockIn: "09:20" })]), PROVIDER, RANGE);
    expect(tcUpsert.mock.calls[0][0].create.status).toBe("late");
    expect(tcUpsert.mock.calls[0][0].create.deltaMinutes).toBe(20);
  });

  it("pointage en avance -> status 'early'", async () => {
    shiftFindFirst.mockResolvedValue({ id: "sh1", startTime: "09:00" });
    await syncTimeClocks(adapterWith([entry({ clockIn: "08:45" })]), PROVIDER, RANGE);
    expect(tcUpsert.mock.calls[0][0].create.status).toBe("early");
    expect(tcUpsert.mock.calls[0][0].create.deltaMinutes).toBe(-15);
  });
});
