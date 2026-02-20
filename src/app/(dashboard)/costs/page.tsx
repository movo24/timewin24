"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoreSearch } from "@/components/store-search";
import { getMondayOfWeek, formatDate } from "@/lib/utils";
import {
  Calculator,
  Euro,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Settings,
  Users,
  AlertTriangle,
} from "lucide-react";

interface CostBreakdown {
  hourlyRateGross: number;
  hours: number;
  grossTotal: number;
  smicHourly: number;
  smicTotal: number;
  aboveSmicTotal: number;
  employerRate: number;
  chargesFull: number;
  chargesOnSmic: number;
  chargesAboveSmic: number;
  reductionEnabled: boolean;
  fillonCoefficient: number;
  reductionAmount: number;
  chargesNet: number;
  chargesSmicNet: number;
  chargesAboveSmicNet: number;
  extraHourlyCost: number;
  extraTotal: number;
  employerCostTotal: number;
  costPerHour: number;
  chargeRateEffective: number;
}

interface CountryConfig {
  id: string;
  code: string;
  name: string;
  currency: string;
  minimumWageHour: number;
  employerRate: number;
  reductionEnabled: boolean;
  reductionMaxCoeff: number;
  reductionThreshold: number;
  extraHourlyCost: number;
  notes: string | null;
}

interface ShiftCostItem {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  employeeId: string;
  employeeName: string;
  hours: number;
  configured: boolean;
  cost: CostBreakdown | null;
}

interface WeeklySummary {
  totalShifts: number;
  configuredShifts: number;
  totalHours: number;
  totalGross: number;
  totalCharges: number;
  totalReduction: number;
  totalCost: number;
}

export default function CostsPage() {
  // Tab: "simulator" | "weekly" | "config"
  const [tab, setTab] = useState<"simulator" | "weekly" | "config">("simulator");

  return (
    <div>
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-4 sm:mb-6 gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Coûts Employeur</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
            Simulateur de charges et suivi des coûts
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-100 rounded-lg p-0.5 mb-4 sm:mb-6 w-full sm:w-fit overflow-x-auto">
        <button
          className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-2 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap ${
            tab === "simulator"
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("simulator")}
        >
          <Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline-block mr-1 sm:mr-1.5 -mt-0.5" />
          <span className="hidden sm:inline">Simulateur</span>
          <span className="sm:hidden">Simul.</span>
        </button>
        <button
          className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-2 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap ${
            tab === "weekly"
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("weekly")}
        >
          <Euro className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline-block mr-1 sm:mr-1.5 -mt-0.5" />
          Coûts
        </button>
        <button
          className={`flex-1 sm:flex-none px-2.5 sm:px-4 py-2 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap ${
            tab === "config"
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("config")}
        >
          <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline-block mr-1 sm:mr-1.5 -mt-0.5" />
          Config
        </button>
      </div>

      {tab === "simulator" && <SimulatorTab />}
      {tab === "weekly" && <WeeklyTab />}
      {tab === "config" && <ConfigTab />}
    </div>
  );
}

// ─── Simulator Tab ─────────────────────────────────

function SimulatorTab() {
  const [hourlyRate, setHourlyRate] = useState("12.02");
  const [hours, setHours] = useState("35");
  const [countryCode, setCountryCode] = useState("FR");
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  const simulate = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/costs/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hourlyRateGross: parseFloat(hourlyRate),
        hours: parseFloat(hours),
        countryCode: countryCode || undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setBreakdown(data.breakdown);
    }
  }, [hourlyRate, hours, countryCode]);

  // Auto-simulate on input change
  useEffect(() => {
    const timer = setTimeout(simulate, 300);
    return () => clearTimeout(timer);
  }, [simulate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Paramètres</h3>

        <div className="space-y-4">
          <div>
            <Label>Taux horaire brut (€/h)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-gray-400 mt-1">SMIC 2026 = 12,02 €/h</p>
          </div>

          <div>
            <Label>Heures travaillées</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-gray-400 mt-1">35h = temps plein légal</p>
          </div>

          <div>
            <Label>Pays</Label>
            <select
              className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm mt-1"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              <option value="FR">France (défaut)</option>
            </select>
          </div>
        </div>

        {/* Quick presets */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">Exemples rapides</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "SMIC 35h", rate: "12.02", h: "35" },
              { label: "15€/h 35h", rate: "15.00", h: "35" },
              { label: "20€/h 35h", rate: "20.00", h: "35" },
              { label: "25€/h 39h", rate: "25.00", h: "39" },
              { label: "SMIC 20h", rate: "12.02", h: "20" },
            ].map((p) => (
              <button
                key={p.label}
                className="px-3 py-1 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
                onClick={() => {
                  setHourlyRate(p.rate);
                  setHours(p.h);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results panel */}
      <div className="space-y-4">
        {breakdown && (
          <>
            {/* Summary card */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-lg p-4 sm:p-6">
              <p className="text-xs sm:text-sm text-gray-400 mb-1">Coût employeur total</p>
              <p className="text-3xl sm:text-4xl font-bold">{breakdown.employerCostTotal.toFixed(2)} €</p>
              <p className="text-xs sm:text-sm text-gray-400 mt-2">
                soit <span className="text-white font-medium">{breakdown.costPerHour.toFixed(2)} €/h</span> coût complet
              </p>
              <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Brut</p>
                  <p className="font-semibold">{breakdown.grossTotal.toFixed(2)} €</p>
                </div>
                <div>
                  <p className="text-gray-400">Charges nettes</p>
                  <p className="font-semibold">{breakdown.chargesNet.toFixed(2)} €</p>
                </div>
              </div>
            </div>

            {/* SMIC / Hors SMIC split */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-green-600" />
                  <p className="text-xs font-medium text-gray-500">Tranche SMIC</p>
                </div>
                <p className="text-lg font-bold text-gray-900">{breakdown.smicTotal.toFixed(2)} €</p>
                <p className="text-xs text-gray-500">Brut ≤ SMIC</p>
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Charges brutes</span>
                    <span>{breakdown.chargesOnSmic.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Réduction Fillon</span>
                    <span>-{breakdown.reductionAmount.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between font-medium mt-1">
                    <span>Charges nettes</span>
                    <span>{breakdown.chargesSmicNet.toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-orange-600" />
                  <p className="text-xs font-medium text-gray-500">Hors SMIC</p>
                </div>
                <p className="text-lg font-bold text-gray-900">{breakdown.aboveSmicTotal.toFixed(2)} €</p>
                <p className="text-xs text-gray-500">Brut &gt; SMIC</p>
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Charges brutes</span>
                    <span>{breakdown.chargesAboveSmic.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Réduction</span>
                    <span className="text-gray-300">—</span>
                  </div>
                  <div className="flex justify-between font-medium mt-1">
                    <span>Charges nettes</span>
                    <span>{breakdown.chargesAboveSmicNet.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Detail breakdown */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Détail du calcul</h4>
              <div className="space-y-1.5 text-sm">
                <Row label="Taux horaire brut" value={`${breakdown.hourlyRateGross.toFixed(2)} €/h`} />
                <Row label="Heures" value={`${breakdown.hours}h`} />
                <Divider />
                <Row label="Brut total" value={`${breakdown.grossTotal.toFixed(2)} €`} bold />
                <Row label={`Charges patronales (${(breakdown.employerRate * 100).toFixed(1)}%)`} value={`+${breakdown.chargesFull.toFixed(2)} €`} />
                {breakdown.reductionEnabled && (
                  <Row
                    label={`Réduction générale (coeff ${breakdown.fillonCoefficient.toFixed(4)})`}
                    value={`-${breakdown.reductionAmount.toFixed(2)} €`}
                    className="text-green-600"
                  />
                )}
                <Row label="= Charges nettes" value={`${breakdown.chargesNet.toFixed(2)} €`} bold />
                <Row label={`Taux effectif`} value={`${(breakdown.chargeRateEffective * 100).toFixed(1)}%`} className="text-gray-400" />
                {breakdown.extraTotal > 0 && (
                  <Row label="Coûts extras" value={`+${breakdown.extraTotal.toFixed(2)} €`} />
                )}
                <Divider />
                <Row label="COÛT EMPLOYEUR" value={`${breakdown.employerCostTotal.toFixed(2)} €`} bold className="text-lg" />
                <Row label="Coût horaire complet" value={`${breakdown.costPerHour.toFixed(2)} €/h`} className="text-gray-500" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Weekly Cost Tab ──────────────────────────────

function WeeklyTab() {
  const [storeId, setStoreId] = useState("");
  const [weekStart, setWeekStart] = useState(getMondayOfWeek());
  const [shiftCosts, setShiftCosts] = useState<ShiftCostItem[]>([]);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCosts = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const res = await fetch(`/api/costs/weekly?storeId=${storeId}&weekStart=${weekStart}`);
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setShiftCosts(data.shiftCosts || []);
      setSummary(data.summary || null);
    }
  }, [storeId, weekStart]);

  useEffect(() => {
    loadCosts();
  }, [loadCosts]);

  function navigateWeek(dir: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7 * dir);
    setWeekStart(formatDate(d));
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${new Date(weekStart).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} - ${weekEnd.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;

  // Group by date
  const byDate: Record<string, ShiftCostItem[]> = {};
  for (const sc of shiftCosts) {
    const key = typeof sc.date === "string" ? sc.date.split("T")[0] : formatDate(new Date(sc.date));
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(sc);
  }

  return (
    <div>
      <div className="space-y-3 mb-4 sm:mb-6">
        <div className="w-full lg:w-72">
          <StoreSearch value={storeId} onChange={setStoreId} placeholder="Sélectionner une boutique..." />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 hidden sm:flex" onClick={() => setWeekStart(getMondayOfWeek())}>
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 sm:hidden" onClick={() => setWeekStart(getMondayOfWeek())}>
            <Calendar className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs sm:text-sm font-medium text-gray-700 text-center flex-1 sm:flex-none">{weekLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!storeId ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Euro className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Sélectionnez une boutique pour voir les coûts</p>
        </div>
      ) : loading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">
          Chargement...
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              <SummaryCard label="Coût total" value={`${summary.totalCost.toFixed(0)} €`} accent />
              <SummaryCard label="Brut total" value={`${summary.totalGross.toFixed(0)} €`} />
              <SummaryCard label="Charges nettes" value={`${summary.totalCharges.toFixed(0)} €`} />
              <SummaryCard label="Réductions" value={`-${summary.totalReduction.toFixed(0)} €`} green />
              <SummaryCard label="Heures" value={`${summary.totalHours}h`} />
            </div>
          )}

          {summary && summary.configuredShifts < summary.totalShifts && (
            <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {summary.totalShifts - summary.configuredShifts} shift(s) sans configuration de coût.
                Allez dans Configuration pour assigner les taux horaires.
              </span>
            </div>
          )}

          {/* Shift cost cards (mobile) */}
          <div className="space-y-2 lg:hidden">
            {shiftCosts.map((sc) => {
              const dateStr = typeof sc.date === "string" ? sc.date.split("T")[0] : "";
              const dateLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
              return (
                <div key={sc.shiftId} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{sc.employeeName}</span>
                      <span className="text-xs text-gray-400 ml-2">{dateLabel}</span>
                    </div>
                    <span className="text-xs font-mono text-gray-500">{sc.startTime}-{sc.endTime}</span>
                  </div>
                  {sc.configured && sc.cost ? (
                    <div className="mt-2 grid grid-cols-4 gap-1 text-xs">
                      <div className="bg-gray-50 rounded px-1.5 py-1 text-center">
                        <span className="text-gray-400 block">{sc.hours}h</span>
                        <span className="font-medium">{sc.cost.grossTotal.toFixed(0)}€</span>
                      </div>
                      <div className="bg-orange-50 rounded px-1.5 py-1 text-center">
                        <span className="text-orange-400 block">Charg.</span>
                        <span className="font-medium text-orange-700">{sc.cost.chargesNet.toFixed(0)}€</span>
                      </div>
                      <div className="bg-green-50 rounded px-1.5 py-1 text-center">
                        <span className="text-green-400 block">Réduc.</span>
                        <span className="font-medium text-green-700">-{sc.cost.reductionAmount.toFixed(0)}€</span>
                      </div>
                      <div className="bg-gray-900 rounded px-1.5 py-1 text-center">
                        <span className="text-gray-400 block">Total</span>
                        <span className="font-bold text-white">{sc.cost.employerCostTotal.toFixed(0)}€</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-400 italic text-center bg-gray-50 rounded py-1.5">
                      Non configuré — {sc.hours}h
                    </div>
                  )}
                </div>
              );
            })}
            {shiftCosts.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
                Aucun shift cette semaine
              </div>
            )}
          </div>

          {/* Shift cost table (desktop) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Horaire</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Employé</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Heures</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Brut</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Charges</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Réduction</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Coût total</th>
                </tr>
              </thead>
              <tbody>
                {shiftCosts.map((sc) => {
                  const dateStr = typeof sc.date === "string" ? sc.date.split("T")[0] : "";
                  return (
                    <tr key={sc.shiftId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">
                        {new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-700">{sc.startTime}-{sc.endTime}</td>
                      <td className="px-4 py-2">{sc.employeeName}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{sc.hours}h</td>
                      {sc.configured && sc.cost ? (
                        <>
                          <td className="px-4 py-2 text-right">{sc.cost.grossTotal.toFixed(2)} €</td>
                          <td className="px-4 py-2 text-right text-orange-600">{sc.cost.chargesNet.toFixed(2)} €</td>
                          <td className="px-4 py-2 text-right text-green-600">-{sc.cost.reductionAmount.toFixed(2)} €</td>
                          <td className="px-4 py-2 text-right font-semibold">{sc.cost.employerCostTotal.toFixed(2)} €</td>
                        </>
                      ) : (
                        <td colSpan={4} className="px-4 py-2 text-center text-gray-400 italic">
                          Non configuré
                        </td>
                      )}
                    </tr>
                  );
                })}
                {shiftCosts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      Aucun shift cette semaine
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Config Tab ────────────────────────────────────

function ConfigTab() {
  const [countries, setCountries] = useState<CountryConfig[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "FR",
    name: "France",
    currency: "EUR",
    minimumWageHour: "12.02",
    employerRate: "0.45",
    reductionEnabled: true,
    reductionMaxCoeff: "0.3206",
    reductionThreshold: "1.6",
    extraHourlyCost: "0",
    notes: "Paramètres France 2026",
  });

  // Employee cost configs
  const [employeeConfigs, setEmployeeConfigs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [empForm, setEmpForm] = useState({ employeeId: "", countryCode: "FR", hourlyRateGross: "12.02" });
  const [empSaving, setEmpSaving] = useState(false);

  useEffect(() => {
    fetch("/api/costs/countries").then((r) => r.json()).then((d) => setCountries(d.countries || []));
    fetch("/api/costs/employees").then((r) => r.json()).then((d) => setEmployeeConfigs(d.configs || []));
    fetch("/api/employees?active=true&limit=200").then((r) => r.json()).then((d) => setEmployees(d.employees || []));
  }, []);

  async function saveCountry() {
    setSaving(true);
    const res = await fetch("/api/costs/countries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setCountries([...countries, data.country]);
      setShowAdd(false);
    } else {
      alert(data.error || "Erreur");
    }
  }

  async function saveEmployeeCost() {
    if (!empForm.employeeId) return;
    setEmpSaving(true);
    const res = await fetch("/api/costs/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(empForm),
    });
    const data = await res.json();
    setEmpSaving(false);
    if (res.ok) {
      // Refresh
      const r = await fetch("/api/costs/employees");
      const d = await r.json();
      setEmployeeConfigs(d.configs || []);
      setEmpForm({ ...empForm, employeeId: "" });
    } else {
      alert(data.error || "Erreur");
    }
  }

  const configuredIds = new Set(employeeConfigs.map((c: any) => c.employeeId));
  const unconfiguredEmployees = employees.filter((e: any) => !configuredIds.has(e.id));

  return (
    <div className="space-y-8">
      {/* Country configs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Règles par pays</h3>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "Annuler" : "+ Ajouter un pays"}
          </Button>
        </div>

        {showAdd && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Code pays</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Nom</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">SMIC horaire (€)</Label>
                <Input type="number" step="0.01" value={form.minimumWageHour} onChange={(e) => setForm({ ...form, minimumWageHour: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Taux charges (%)</Label>
                <Input type="number" step="0.01" value={form.employerRate} onChange={(e) => setForm({ ...form, employerRate: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Coeff max réduction</Label>
                <Input type="number" step="0.0001" value={form.reductionMaxCoeff} onChange={(e) => setForm({ ...form, reductionMaxCoeff: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Seuil (x SMIC)</Label>
                <Input type="number" step="0.1" value={form.reductionThreshold} onChange={(e) => setForm({ ...form, reductionThreshold: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Extra /h (€)</Label>
                <Input type="number" step="0.01" value={form.extraHourlyCost} onChange={(e) => setForm({ ...form, extraHourlyCost: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
              </div>
            </div>
            <Button className="mt-3" onClick={saveCountry} disabled={saving}>
              {saving ? "..." : "Enregistrer"}
            </Button>
          </div>
        )}

        {countries.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
            <p>Aucun pays configuré.</p>
            <p className="text-sm mt-1">Ajoutez la France pour commencer.</p>
          </div>
        ) : (
          <>
          <div className="space-y-2 lg:hidden">
            {countries.map((c) => (
              <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="font-semibold text-sm">{c.code} — {c.name}</div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">SMIC/h</span>
                    <span className="font-medium">{c.minimumWageHour.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Charges</span>
                    <span className="font-medium">{(c.employerRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Coeff max</span>
                    <span className="font-medium">{c.reductionMaxCoeff.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Seuil</span>
                    <span className="font-medium">{c.reductionThreshold}x</span>
                  </div>
                </div>
                {c.notes && <p className="mt-1.5 text-xs text-gray-400 italic">{c.notes}</p>}
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Pays</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">SMIC/h</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Charges</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Coeff max</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Seuil</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Notes</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-4 py-2 font-medium">{c.code} — {c.name}</td>
                    <td className="px-4 py-2 text-right">{c.minimumWageHour.toFixed(2)} €</td>
                    <td className="px-4 py-2 text-right">{(c.employerRate * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right">{c.reductionMaxCoeff.toFixed(4)}</td>
                    <td className="px-4 py-2 text-right">{c.reductionThreshold}x</td>
                    <td className="px-4 py-2 text-gray-500">{c.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Employee cost configs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Taux horaires employés</h3>
            <p className="text-xs text-gray-500">Assignez un taux horaire brut à chaque employé</p>
          </div>
        </div>

        {/* Add form */}
        {countries.length > 0 && unconfiguredEmployees.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-end gap-3">
              <div className="sm:col-span-2 lg:min-w-[200px] lg:w-auto">
                <Label className="text-xs">Employé</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm mt-1"
                  value={empForm.employeeId}
                  onChange={(e) => setEmpForm({ ...empForm, employeeId: e.target.value })}
                >
                  <option value="">Sélectionner...</option>
                  {unconfiguredEmployees.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Pays</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm mt-1"
                  value={empForm.countryCode}
                  onChange={(e) => setEmpForm({ ...empForm, countryCode: e.target.value })}
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Taux brut (€/h)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={empForm.hourlyRateGross}
                  onChange={(e) => setEmpForm({ ...empForm, hourlyRateGross: e.target.value })}
                  className="mt-1"
                />
              </div>
              <Button className="w-full sm:w-auto" onClick={saveEmployeeCost} disabled={empSaving || !empForm.employeeId}>
                {empSaving ? "..." : "Assigner"}
              </Button>
            </div>
          </div>
        )}

        {/* Existing configs - cards (mobile) */}
        {employeeConfigs.length > 0 ? (
          <>
            <div className="space-y-2 lg:hidden">
              {employeeConfigs.map((c: any) => (
                <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{c.employee.firstName} {c.employee.lastName}</span>
                    <span className="text-xs text-gray-400 ml-1.5">{c.country.code}</span>
                  </div>
                  <span className="font-mono font-semibold text-sm">{c.hourlyRateGross.toFixed(2)} €/h</span>
                </div>
              ))}
            </div>

            {/* Existing configs - table (desktop) */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Employé</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Pays</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">Taux brut/h</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeConfigs.map((c: any) => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="px-4 py-2">{c.employee.firstName} {c.employee.lastName}</td>
                      <td className="px-4 py-2 text-gray-600">{c.country.code} — {c.country.name}</td>
                      <td className="px-4 py-2 text-right font-mono font-medium">{c.hourlyRateGross.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-400">
            <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p>Aucun employé configuré.</p>
            <p className="text-xs mt-1">Ajoutez d'abord un pays, puis assignez des taux.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper Components ─────────────────────────────

function Row({
  label,
  value,
  bold,
  className,
}: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${className || ""}`}>
      <span className={bold ? "text-gray-900" : "text-gray-500"}>{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-100 my-1" />;
}

function SummaryCard({
  label,
  value,
  accent,
  green,
}: {
  label: string;
  value: string;
  accent?: boolean;
  green?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 sm:p-4 ${
        accent
          ? "bg-gray-900 text-white"
          : "bg-white border border-gray-200"
      }`}
    >
      <p className={`text-[10px] sm:text-xs ${accent ? "text-gray-400" : "text-gray-500"}`}>{label}</p>
      <p
        className={`text-lg sm:text-xl font-bold mt-0.5 sm:mt-1 ${
          accent ? "text-white" : green ? "text-green-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
