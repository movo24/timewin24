// Mock du singleton Prisma : detectAlerts fait 3 requetes (daily + 2x scores)
// puis applique des regles de seuil en memoire.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    employeePerformanceDaily: { findMany: jest.fn() },
    employeePerformanceScore: { findMany: jest.fn() },
  },
}));

import { detectAlerts } from "@/lib/analytics/alerts-detector";
import { prisma } from "@/lib/prisma";

// M116 / analytics — detection d'alertes de performance par comparaison aux
// moyennes magasin (CA/h, panier, upsell, especes) + chute de score.

const dailyFindMany = prisma.employeePerformanceDaily.findMany as jest.Mock;
const scoreFindMany = prisma.employeePerformanceScore.findMany as jest.Mock;

const FROM = new Date("2026-06-01T00:00:00Z");
const TO = new Date("2026-06-07T00:00:00Z");

const daily = (o: Partial<{
  employeeId: string; storeId: string; firstName: string; lastName: string;
  totalSales: number; transactions: number; itemsSold: number;
  workingHours: number; cashAmount: number; avgBasket: number;
}> = {}) => ({
  employeeId: o.employeeId ?? "e1", storeId: o.storeId ?? "s1",
  date: FROM, employee: { firstName: o.firstName ?? "A", lastName: o.lastName ?? "B" },
  totalSales: o.totalSales ?? 100, transactions: o.transactions ?? 10,
  itemsSold: o.itemsSold ?? 20, workingHours: o.workingHours ?? 10,
  cashAmount: o.cashAmount ?? 0, avgBasket: o.avgBasket ?? 5,
});

beforeEach(() => {
  dailyFindMany.mockReset();
  scoreFindMany.mockReset().mockResolvedValue([]); // pas de drop par defaut
});

describe("detectAlerts", () => {
  it("retourne [] sans donnee journaliere", async () => {
    dailyFindMany.mockResolvedValue([]);
    expect(await detectAlerts(FROM, TO)).toEqual([]);
  });

  it("regle 1 : CA/h < 50% de la moyenne magasin -> low_revenue critical", async () => {
    dailyFindMany.mockResolvedValue([
      daily({ employeeId: "low", totalSales: 10, workingHours: 10 }),   // CA/h = 1
      daily({ employeeId: "high", totalSales: 100, workingHours: 10 }), // CA/h = 10
    ]); // moyenne magasin = 5.5 ; 50% = 2.75
    const alerts = await detectAlerts(FROM, TO);
    const lr = alerts.find((a) => a.type === "low_revenue");
    expect(lr).toBeDefined();
    expect(lr!.employeeId).toBe("low");
    expect(lr!.severity).toBe("critical");
    expect(alerts.find((a) => a.type === "low_revenue" && a.employeeId === "high")).toBeUndefined();
  });

  it("regle 3 : upsell < 1.2 -> no_upsell warning", async () => {
    // un seul employe -> les regles 1/2 (auto-comparaison) ne se declenchent pas
    dailyFindMany.mockResolvedValue([daily({ transactions: 10, itemsSold: 5 })]); // upsell 0.5
    const alerts = await detectAlerts(FROM, TO);
    const nu = alerts.find((a) => a.type === "no_upsell");
    expect(nu).toBeDefined();
    expect(nu!.severity).toBe("warning");
    expect(nu!.threshold).toBe(1.2);
  });

  it("regle 4 : part especes > 70% -> cash_anomaly warning", async () => {
    dailyFindMany.mockResolvedValue([daily({ totalSales: 100, cashAmount: 80, itemsSold: 20, transactions: 10 })]);
    const alerts = await detectAlerts(FROM, TO);
    const ca = alerts.find((a) => a.type === "cash_anomaly");
    expect(ca).toBeDefined();
    expect(ca!.value).toBe(0.8);
    expect(alerts.find((a) => a.type === "no_upsell")).toBeUndefined(); // upsell 2.0 ok
  });

  it("regle 5 : chute de score > 30% vs periode precedente -> performance_drop", async () => {
    dailyFindMany.mockResolvedValue([daily({ itemsSold: 20, transactions: 10 })]); // pas d'alerte daily
    scoreFindMany
      .mockResolvedValueOnce([{ employeeId: "e1", storeId: "s1", overallScore: 50, employee: { firstName: "A", lastName: "B" } }])
      .mockResolvedValueOnce([{ employeeId: "e1", storeId: "s1", overallScore: 100 }]);
    const alerts = await detectAlerts(FROM, TO);
    const pd = alerts.find((a) => a.type === "performance_drop");
    expect(pd).toBeDefined();
    expect(pd!.severity).toBe("critical");
    expect(pd!.value).toBe(50);
  });

  it("propage le filtre storeId aux requetes", async () => {
    dailyFindMany.mockResolvedValue([]);
    await detectAlerts(FROM, TO, "store-42");
    expect(dailyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: "store-42" }) })
    );
  });
});
