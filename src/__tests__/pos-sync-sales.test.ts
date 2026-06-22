jest.mock("@/lib/prisma", () => ({ prisma: { posSalesData: { upsert: jest.fn() } } }));

import { syncSales } from "@/lib/pos/sync-engine";
import { prisma } from "@/lib/prisma";
import type { PosAdapter } from "@/lib/pos/adapter";
import type { PosSalesEntry, PosDateRange } from "@/lib/pos/types";

// M116 / POS — import des ventes horaires POS -> TimeWin. Regle TimeWin24
// "no duplicate events" : upsert idempotent sur providerId+storeId+date+hourSlot.

const upsert = prisma.posSalesData.upsert as jest.Mock;
const RANGE: PosDateRange = { from: "2026-06-22", to: "2026-06-22" };
const PROVIDER = { id: "prov1", storeLinks: [{ storeId: "s1", posStoreId: "POS-S1" }] };

const sale = (o: Partial<PosSalesEntry> = {}): PosSalesEntry => ({
  posRecordId: "sale1", posStoreId: "POS-S1", date: "2026-06-22",
  hourSlot: 14, revenue: 250, transactions: 12, itemsSold: 30, ...o,
});

const adapterWith = (entries: PosSalesEntry[]) =>
  ({ fetchSales: jest.fn().mockResolvedValue(entries) } as unknown as PosAdapter);

beforeEach(() => upsert.mockReset().mockResolvedValue({}));

describe("syncSales", () => {
  it("ignore une vente dont le magasin n'est pas mappe (pas d'upsert)", async () => {
    const r = await syncSales(adapterWith([sale({ posStoreId: "INCONNU" })]), PROVIDER, RANGE);
    expect(r.skipped).toBe(1);
    expect(r.created).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upsert idempotent sur providerId+storeId+date+hourSlot (anti-doublon)", async () => {
    await syncSales(adapterWith([sale({ hourSlot: 9 })]), PROVIDER, RANGE);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where.providerId_storeId_date_hourSlot).toMatchObject({
      providerId: "prov1", storeId: "s1", hourSlot: 9,
    });
    expect(arg.where.providerId_storeId_date_hourSlot.date).toEqual(new Date("2026-06-22T00:00:00Z"));
  });

  it("renseigne CA / transactions / articles dans create", async () => {
    await syncSales(adapterWith([sale({ revenue: 250, transactions: 12, itemsSold: 30 })]), PROVIDER, RANGE);
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      storeId: "s1", revenue: 250, transactions: 12, itemsSold: 30,
    });
  });

  it("compte les ventes creees et retourne success", async () => {
    const r = await syncSales(adapterWith([sale({ hourSlot: 9 }), sale({ hourSlot: 10 })]), PROVIDER, RANGE);
    expect(r.created).toBe(2);
    expect(r.success).toBe(true);
    expect(r.totalRecords).toBe(2);
  });
});
