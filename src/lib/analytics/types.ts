/**
 * Analytics Engine — Shared Types
 *
 * Types partagés pour le moteur de calcul analytique
 * et les endpoints API analytics.
 */

// ─── Dashboard KPIs ─────────────────────────────────

export interface DashboardKPIs {
  totalRevenue: number;
  totalTransactions: number;
  avgBasket: number;
  revenuePerHour: number;
  cashAmount: number;
  cardAmount: number;
  employeeCount: number;
  totalHours: number;
}

// ─── Employee Ranking ───────────────────────────────

export interface EmployeeRanking {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  storeId: string;
  storeName: string;
  overallScore: number;
  salesScore: number;
  productivityScore: number;
  upsellScore: number;
  disciplineScore: number;
  inventoryScore: number;
  rank: number | null;
  badge: "EXCELLENT" | "BON" | "MOYEN" | "FAIBLE";
  totalSales: number;
  salesPerHour: number;
  transactions: number;
}

// ─── Hourly Sales Heatmap ───────────────────────────

export interface HourlySalesHeatmap {
  hour: number;
  dayOfWeek: number;
  revenue: number;
  transactions: number;
}

// ─── Performance Alerts ─────────────────────────────

export type AlertType =
  | "low_revenue"
  | "low_basket"
  | "no_upsell"
  | "cash_anomaly"
  | "performance_drop";

export type AlertSeverity = "warning" | "critical";

export interface PerformanceAlert {
  type: AlertType;
  severity: AlertSeverity;
  employeeId: string;
  employeeName: string;
  storeId: string;
  message: string;
  value: number;
  threshold: number;
}
