"use client";

/**
 * Aujourd'hui — vue manager snapshot temps réel (mobile-first).
 *
 * Consomme GET /api/timesheet/today.
 *
 * Choix V1 (volontairement simples) :
 *   - "use client" : pas de Server Component ici car refresh manuel +
 *     formatage horaire dépendant du fuseau du téléphone (locale-dependent).
 *   - Pas de SWR / pas de polling : un seul fetch au montage + bouton refresh.
 *   - Types inline : pas de fichier partagé tant que la page reste la seule
 *     consommatrice côté UI. À factoriser si /alertes ou /pointages réutilisent.
 *   - Mobile-first : grilles 2 colonnes par défaut, élargies en >= sm / lg.
 *   - Pas de tableau large ni de scroll horizontal.
 *   - États loading / error / empty explicites.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  AlertTriangle,
  Users,
  Clock,
  TrendingUp,
  CalendarX,
  Store as StoreIcon,
} from "lucide-react";
import Link from "next/link";

// ─── Types (alignés sur /api/timesheet/today) ──────────────────────────────

type TodaySummary = {
  storesActive: number;
  shiftsPlanned: number;
  shiftsCovered: number;
  shiftsUncovered: number;
  clockInsTotal: number;
  clockInsOpen: number;
  plannedMinutes: number;
  workedMinutes: number;
  inProgressMinutes: number;
  lateMinutesTotal: number;
  coverageRate: number;
  absencesApproved: number;
};

type PresentEmployee = {
  employeeId: string;
  firstName: string;
  lastName: string;
};

type StoreToday = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  shiftsPlanned: number;
  shiftsCovered: number;
  clockInsOpen: number;
  plannedMinutes: number;
  workedMinutes: number;
  lateCount: number;
  presentNow: PresentEmployee[];
};

type TodayAlert = {
  type: "CLOCKIN_NOT_CLOSED" | "LATE";
  severity: "CRITICAL" | "INFO";
  employeeId: string;
  storeId: string;
  shiftId: string | null;
  clockInId: string;
  message: string;
};

type TodayResponse = {
  meta: {
    companyId: string;
    date: string;
    storesScope: string[] | null;
    generatedAt: string;
    currency: "EUR";
  };
  summary: TodaySummary;
  stores: StoreToday[];
  alerts: TodayAlert[];
};

// ─── Helpers d'affichage ───────────────────────────────────────────────────

function formatMinutes(min: number): string {
  if (!isFinite(min) || min < 0) return "0h00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function formatRate(rate: number): string {
  if (!isFinite(rate) || rate < 0) return "0 %";
  return `${Math.round(rate * 100)} %`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function initials(first: string, last: string): string {
  const a = first?.[0] ?? "";
  const b = last?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

// ─── Sous-composants ───────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  Icon: React.ElementType;
  tone?: "neutral" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-gray-900";
  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs">{label}</CardTitle>
          <Icon className="h-4 w-4 text-gray-400 shrink-0" />
        </div>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function AlertItem({ alert }: { alert: TodayAlert }) {
  const isCritical = alert.severity === "CRITICAL";
  const boxClass = isCritical
    ? "border-red-200 bg-red-50"
    : "border-amber-200 bg-amber-50";
  const iconClass = isCritical ? "text-red-600" : "text-amber-600";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 ${boxClass}`}
    >
      <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${iconClass}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{alert.message}</p>
        <p className="text-xs text-gray-500 truncate">
          Employé {alert.employeeId.slice(0, 8)}…
        </p>
      </div>
    </div>
  );
}

function PresentBadge({ emp }: { emp: PresentEmployee }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-800"
      title={`${emp.firstName} ${emp.lastName}`}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
        {initials(emp.firstName, emp.lastName)}
      </span>
      <span className="truncate max-w-[120px]">
        {emp.firstName} {emp.lastName[0] ?? ""}.
      </span>
    </span>
  );
}

function StoreCard({ store }: { store: StoreToday }) {
  const coverage =
    store.shiftsPlanned === 0 ? 0 : store.shiftsCovered / store.shiftsPlanned;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm text-gray-900 truncate">
              {store.storeName || "Magasin"}
            </CardTitle>
            {store.storeCode && (
              <p className="text-xs text-gray-400 mt-0.5">{store.storeCode}</p>
            )}
          </div>
          <StoreIcon className="h-4 w-4 text-gray-400 shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Couverture
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {store.shiftsCovered}/{store.shiftsPlanned}
            </p>
            <p className="text-[10px] text-gray-500">{formatRate(coverage)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Présents
            </p>
            <p className="text-sm font-semibold text-gray-900">
              {store.clockInsOpen}
            </p>
            <p className="text-[10px] text-gray-500">en cours</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Retards
            </p>
            <p
              className={`text-sm font-semibold ${
                store.lateCount > 0 ? "text-amber-600" : "text-gray-900"
              }`}
            >
              {store.lateCount}
            </p>
            <p className="text-[10px] text-gray-500">
              {formatMinutes(store.workedMinutes)}
            </p>
          </div>
        </div>

        {store.presentNow.length > 0 ? (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">
              Présents maintenant
            </p>
            <div className="flex flex-wrap gap-1.5">
              {store.presentNow.map((emp) => (
                <PresentBadge key={emp.employeeId} emp={emp} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">
            Aucun employé pointé pour le moment
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Skeleton loading ──────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-24 rounded-xl border border-gray-200 bg-gray-100 animate-pulse"
        />
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AujourdHuiPage() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch("/api/timesheet/today", {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || `Erreur ${res.status} lors du chargement`,
        );
      }
      const json = (await res.json()) as TodayResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load("initial");
  }, [load]);

  const summary = data?.summary;
  const stores = data?.stores ?? [];
  const alerts = data?.alerts ?? [];
  const isEmpty =
    !!data &&
    summary?.shiftsPlanned === 0 &&
    summary?.clockInsTotal === 0 &&
    summary?.absencesApproved === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 safe-top">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              Aujourd&apos;hui
            </h1>
            <p className="text-xs text-gray-500 truncate">
              {data?.meta.date
                ? new Date(data.meta.date).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Vue manager temps réel"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => load("refresh")}
            disabled={loading || refreshing}
            aria-label="Rafraîchir"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5 safe-bottom">
        {/* Erreur */}
        {error && !loading && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">
              Impossible de charger les données
            </p>
            <p className="text-xs text-red-700 mt-0.5 break-words">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => load("refresh")}
            >
              Réessayer
            </Button>
          </div>
        )}

        {/* Loading initial */}
        {loading && !error && <LoadingSkeleton />}

        {/* Empty state */}
        {!loading && !error && isEmpty && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
            <CalendarX className="h-8 w-8 text-gray-400 mx-auto" />
            <p className="mt-2 text-sm font-medium text-gray-900">
              Aucune activité aujourd&apos;hui
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Aucun shift planifié, aucun pointage, aucune absence.
            </p>
            <Link
              href="/planning"
              className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Ouvrir le planning →
            </Link>
          </div>
        )}

        {/* Contenu */}
        {!loading && !error && summary && !isEmpty && (
          <>
            {/* KPIs */}
            <section
              aria-label="Indicateurs clés"
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              <KpiCard
                label="Couverture"
                value={formatRate(summary.coverageRate)}
                hint={`${summary.shiftsCovered}/${summary.shiftsPlanned} shifts`}
                Icon={TrendingUp}
                tone={
                  summary.shiftsUncovered > 0 && summary.shiftsPlanned > 0
                    ? "warn"
                    : "neutral"
                }
              />
              <KpiCard
                label="Présents"
                value={String(summary.clockInsOpen)}
                hint={`${summary.clockInsTotal} pointages aujourd'hui`}
                Icon={Users}
              />
              <KpiCard
                label="Retards"
                value={formatMinutes(summary.lateMinutesTotal)}
                hint="cumulés"
                Icon={Clock}
                tone={summary.lateMinutesTotal > 0 ? "warn" : "neutral"}
              />
              <KpiCard
                label="Absences"
                value={String(summary.absencesApproved)}
                hint="approuvées"
                Icon={CalendarX}
                tone={summary.absencesApproved > 0 ? "warn" : "neutral"}
              />
            </section>

            {/* Alertes */}
            {alerts.length > 0 && (
              <section aria-label="Alertes" className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Alertes ({alerts.length})
                </h2>
                <div className="space-y-2">
                  {alerts.map((a) => (
                    <AlertItem key={a.clockInId + a.type} alert={a} />
                  ))}
                </div>
              </section>
            )}

            {/* Magasins */}
            {stores.length > 0 && (
              <section aria-label="Magasins" className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Magasins ({stores.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {stores.map((s) => (
                    <StoreCard key={s.storeId} store={s} />
                  ))}
                </div>
              </section>
            )}

            {/* Footer infos */}
            {data?.meta.generatedAt && (
              <p className="text-[11px] text-gray-400 text-center pt-2">
                Mis à jour à {formatTime(data.meta.generatedAt)}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
