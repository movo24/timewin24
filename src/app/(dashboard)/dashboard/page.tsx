"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Store,
  Users,
  Calendar,
  ScanLine,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Bell,
  ChevronRight,
  RefreshCw,
  Zap,
  Activity,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type DashboardData = {
  stores: { total: number; active: number; inactive: number };
  employees: { total: number; active: number; inactive: number };
  today: {
    date: string;
    shiftsTotal: number;
    shiftsCovered: number;
    shiftsUncovered: number;
    clockIns: number;
    attendanceRate: number;
    absences: number;
  };
  week: {
    start: string;
    end: string;
    shiftsTotal: number;
    shiftsUncovered: number;
    coverageRate: number;
  };
  alerts: {
    total: number;
    topAlerts: {
      id: string;
      type: string;
      message: string;
      severity: string;
      createdAt: string;
      storeId: string | null;
      store: { name: string } | null;
    }[];
  };
  anomalies: { open: number };
  performance: { avgScore: number | null; totalHours: number | null };
  storeCards: {
    id: string;
    name: string;
    city: string | null;
    storeCode: string | null;
    employeeCount: number;
  }[];
};

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatWeek(start: string, end: string) {
  const s = new Date(start).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const e = new Date(end).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${s} – ${e}`;
}

function getRateColor(rate: number) {
  if (rate >= 90) return "text-emerald-600";
  if (rate >= 70) return "text-amber-600";
  return "text-red-600";
}

function getRateBg(rate: number) {
  if (rate >= 90) return "bg-emerald-50 border-emerald-200";
  if (rate >= 70) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function getSeverityDot(severity: string) {
  switch (severity) {
    case "HIGH":
    case "CRITICAL":
      return "bg-red-500";
    case "MEDIUM":
      return "bg-amber-500";
    default:
      return "bg-blue-500";
  }
}

// ── Composants ───────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "blue",
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "emerald" | "amber" | "red" | "violet";
  href?: string;
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-50 text-violet-600",
  };

  const card = (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 hover:shadow-sm transition-shadow">
      <div className={`rounded-lg p-2.5 ${colors[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {href && <ChevronRight className="h-4 w-4 text-gray-300 mt-1 shrink-0" />}
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

function RateGauge({ rate, label }: { rate: number; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        <span className={`text-sm font-bold ${getRateColor(rate)}`}>{rate}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500"
          }`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Erreur serveur");
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch {
      setError("Impossible de charger le tableau de bord");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Rafraîchissement automatique toutes les 60 secondes
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>Chargement du tableau de bord...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <XCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stores, employees, today, week, alerts, anomalies, performance, storeCards } = data;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">
            {formatDate(today.date)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(alerts.total > 0 || anomalies.open > 0) && (
            <Link
              href="/alertes"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
            >
              <Bell className="h-4 w-4" />
              {alerts.total + anomalies.open} alerte{alerts.total + anomalies.open > 1 ? "s" : ""}
            </Link>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">
              {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </button>
        </div>
      </div>

      {/* ── KPIs principaux ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Store}
          label="Magasins actifs"
          value={stores.active}
          sub={`${stores.total} au total`}
          color="blue"
          href="/stores"
        />
        <KpiCard
          icon={Users}
          label="Employés actifs"
          value={employees.active}
          sub={`${employees.total} au total`}
          color="violet"
          href="/employees"
        />
        <KpiCard
          icon={Calendar}
          label="Shifts aujourd'hui"
          value={today.shiftsTotal}
          sub={
            today.shiftsUncovered > 0
              ? `${today.shiftsUncovered} non couvert${today.shiftsUncovered > 1 ? "s" : ""}`
              : "Tous couverts"
          }
          color={today.shiftsUncovered > 0 ? "amber" : "emerald"}
          href="/planning"
        />
        <KpiCard
          icon={ScanLine}
          label="Pointages du jour"
          value={today.clockIns}
          sub={`${today.attendanceRate}% de présence`}
          color={today.attendanceRate >= 90 ? "emerald" : today.attendanceRate >= 70 ? "amber" : "red"}
          href="/pointages"
        />
      </div>

      {/* ── Santé planning + Alertes ───────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Santé planning */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Santé du planning</h2>
            </div>
            <span className="text-xs text-gray-400">
              Semaine {formatWeek(week.start, week.end)}
            </span>
          </div>

          <div className="space-y-3">
            <RateGauge rate={week.coverageRate} label="Couverture hebdo" />
            <RateGauge rate={today.attendanceRate} label="Présence aujourd'hui" />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xs text-gray-400">Shifts semaine</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{week.shiftsTotal}</p>
            </div>
            <div className="text-center border-x border-gray-100">
              <p className="text-xs text-gray-400">Non couverts</p>
              <p className={`text-lg font-bold mt-0.5 ${week.shiftsUncovered > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {week.shiftsUncovered}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Absences aujourd'hui</p>
              <p className={`text-lg font-bold mt-0.5 ${today.absences > 0 ? "text-amber-600" : "text-gray-900"}`}>
                {today.absences}
              </p>
            </div>
          </div>

          <Link
            href="/planning"
            className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
          >
            Voir le planning complet
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </Link>
        </div>

        {/* Alertes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Alertes</h2>
            </div>
            {alerts.total > 0 && (
              <span className="text-xs font-semibold bg-red-100 text-red-700 rounded-full px-2 py-0.5">
                {alerts.total}
              </span>
            )}
          </div>

          {alerts.total === 0 && anomalies.open === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
              <CheckCircle className="h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-sm text-gray-500">Aucune alerte en cours</p>
            </div>
          ) : (
            <div className="flex-1 space-y-2.5">
              {anomalies.open > 0 && (
                <Link
                  href="/alertes"
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-violet-50 border border-violet-100 hover:bg-violet-100 transition-colors"
                >
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-violet-800">Anomalies IA</p>
                    <p className="text-xs text-violet-600 mt-0.5">
                      {anomalies.open} anomalie{anomalies.open > 1 ? "s" : ""} non résolue{anomalies.open > 1 ? "s" : ""}
                    </p>
                  </div>
                </Link>
              )}
              {alerts.topAlerts.map((alert) => (
                <Link
                  key={alert.id}
                  href="/alertes"
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors"
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${getSeverityDot(alert.severity)}`} />
                  <div className="flex-1 min-w-0">
                    {alert.store && (
                      <p className="text-xs font-medium text-gray-700 truncate">{alert.store.name}</p>
                    )}
                    <p className="text-xs text-gray-500 truncate mt-0.5">{alert.message}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Link
            href="/alertes"
            className="flex items-center justify-between mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Toutes les alertes
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* ── Performance + Accès rapides ─────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Performance récente */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Performance 7 jours</h2>
          </div>

          {performance.avgScore !== null ? (
            <div className="space-y-4">
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold text-gray-900">{performance.avgScore}</span>
                <span className="text-gray-400 mb-1">/100</span>
              </div>
              <RateGauge rate={performance.avgScore} label="Score moyen équipe" />
              {performance.totalHours !== null && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Heures travaillées</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">
                    {performance.totalHours}h
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Zap className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Données en cours de calcul</p>
            </div>
          )}

          <Link
            href="/performance"
            className="flex items-center justify-between mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Voir l'analyse complète
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Accès rapides */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Accès rapides</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { href: "/planning", label: "Planning", icon: Calendar, desc: "Shifts & rotation" },
              { href: "/pointages", label: "Pointages", icon: ScanLine, desc: "Entrées / sorties" },
              { href: "/absences", label: "Absences", icon: AlertTriangle, desc: "Gestion des absences" },
              { href: "/employees", label: "Employés", icon: Users, desc: "Profils & contrats" },
              { href: "/stores", label: "Magasins", icon: Store, desc: "Sites & config" },
              { href: "/performance", label: "Performance", icon: BarChart3, desc: "Analytics & coûts" },
            ].map(({ href, label, icon: Icon, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col gap-2 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-colors"
              >
                <Icon className="h-5 w-5 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Magasins actifs ────────────────────────────────────── */}
      {storeCards.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Magasins actifs</h2>
            </div>
            <Link href="/stores" className="text-sm text-blue-600 hover:underline">
              Gérer →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {storeCards.map((store) => (
              <Link
                key={store.id}
                href={`/stores?highlight=${store.id}`}
                className="flex flex-col gap-1 p-3 rounded-lg bg-gray-50 border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-colors"
              >
                <p className="text-sm font-semibold text-gray-900 truncate">{store.name}</p>
                {store.city && <p className="text-xs text-gray-400">{store.city}</p>}
                <p className="text-xs text-gray-500 mt-1">
                  {store.employeeCount} employé{store.employeeCount > 1 ? "s" : ""}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
