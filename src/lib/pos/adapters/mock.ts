// ─── Mock POS Adapter ──────────────────────────────
// Simulateur de POS pour le développement et les tests.
// Génère des données réalistes sans connexion externe.

import type { PosAdapter } from "../adapter";
import type {
  PosProviderConfig,
  PosEmployee,
  PosStore,
  PosTimeClockEntry,
  PosSalesEntry,
  PosDateRange,
} from "../types";

export class MockPosAdapter implements PosAdapter {
  readonly providerName = "Mock POS (Dev)";
  private config: PosProviderConfig | null = null;

  async initialize(config: PosProviderConfig): Promise<void> {
    this.config = config;
    // Simule un délai réseau
    await new Promise((r) => setTimeout(r, 100));
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) return false;
    // Simule un test de connexion
    await new Promise((r) => setTimeout(r, 200));
    return true;
  }

  // ── Employés ──

  async fetchEmployees(): Promise<PosEmployee[]> {
    await new Promise((r) => setTimeout(r, 150));
    return [
      { posId: "POS-EMP-001", name: "Jean D.", email: "jean.dupont@timewin.fr", pin: "1234", role: "cashier", active: true },
      { posId: "POS-EMP-002", name: "Marie M.", email: "marie.martin@timewin.fr", pin: "5678", role: "cashier", active: true },
      { posId: "POS-EMP-003", name: "Pierre B.", email: "pierre.bernard@timewin.fr", pin: "9012", role: "manager", active: true },
      { posId: "POS-EMP-004", name: "Sophie P.", email: "sophie.petit@timewin.fr", pin: "3456", role: "cashier", active: false },
    ];
  }

  async pushEmployee(employee: {
    name: string;
    email: string;
    pin?: string;
    role?: string;
    active: boolean;
  }): Promise<{ posId: string }> {
    await new Promise((r) => setTimeout(r, 200));
    const id = `POS-EMP-${Date.now().toString(36).toUpperCase()}`;
    console.log(`[MockPOS] Created employee ${employee.name} → ${id}`);
    return { posId: id };
  }

  async deactivateEmployee(posEmployeeId: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 100));
    console.log(`[MockPOS] Deactivated employee ${posEmployeeId}`);
  }

  // ── Magasins ──

  async fetchStores(): Promise<PosStore[]> {
    await new Promise((r) => setTimeout(r, 100));
    return [
      { posId: "POS-STORE-001", name: "Boutique Paris Rivoli", address: "55 rue de Rivoli", active: true },
      { posId: "POS-STORE-002", name: "Boutique Lyon Part-Dieu", address: "CC Part-Dieu", active: true },
      { posId: "POS-STORE-003", name: "Boutique Marseille", address: "15 Quai du Port", active: false },
    ];
  }

  // ── Pointages ──

  async fetchTimeClocks(range: PosDateRange): Promise<PosTimeClockEntry[]> {
    await new Promise((r) => setTimeout(r, 300));

    const entries: PosTimeClockEntry[] = [];
    const start = new Date(range.from);
    const end = new Date(range.to);

    const employees = ["POS-EMP-001", "POS-EMP-002", "POS-EMP-003"];
    const stores = ["POS-STORE-001", "POS-STORE-002"];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0) continue; // Pas de pointage le dimanche

      for (const empId of employees) {
        // 80% de chance de pointer
        if (Math.random() > 0.8) continue;

        const storeId = stores[Math.floor(Math.random() * stores.length)];
        const dateStr = d.toISOString().split("T")[0];

        // Horaire avec léger aléa (+/- 15 min)
        const baseStart = 9 + Math.floor(Math.random() * 2);
        const jitter = Math.floor(Math.random() * 30) - 15;
        const startMin = baseStart * 60 + jitter;
        const endMin = startMin + 7 * 60 + Math.floor(Math.random() * 120);

        entries.push({
          posRecordId: `TC-${dateStr}-${empId}`,
          posEmployeeId: empId,
          posStoreId: storeId,
          date: dateStr,
          clockIn: `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`,
          clockOut: `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`,
          breakMinutes: 30 + Math.floor(Math.random() * 30),
        });
      }
    }

    return entries;
  }

  // ── Ventes ──

  async fetchSales(range: PosDateRange): Promise<PosSalesEntry[]> {
    await new Promise((r) => setTimeout(r, 250));

    const entries: PosSalesEntry[] = [];
    const start = new Date(range.from);
    const end = new Date(range.to);
    const stores = ["POS-STORE-001", "POS-STORE-002"];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];

      for (const storeId of stores) {
        // Heures d'ouverture : 9h-20h
        for (let hour = 9; hour < 20; hour++) {
          // Pic midi (12-14h) et fin de journée (17-19h)
          const isPeak = (hour >= 12 && hour <= 14) || (hour >= 17 && hour <= 19);
          const baseRevenue = isPeak ? 800 : 300;
          const revenue = baseRevenue + Math.floor(Math.random() * 400);
          const transactions = Math.floor(revenue / (15 + Math.random() * 25));

          entries.push({
            posRecordId: `SALE-${dateStr}-${storeId}-${hour}`,
            posStoreId: storeId,
            date: dateStr,
            hourSlot: hour,
            revenue: Math.round(revenue * 100) / 100,
            transactions,
            itemsSold: transactions + Math.floor(Math.random() * transactions * 0.5),
          });
        }
      }
    }

    return entries;
  }
}
