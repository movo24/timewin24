"use client";

import { useState, useEffect, useCallback } from "react";
import { StoreSearch } from "@/components/store-search";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet,
  Download,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Info,
  Clock,
} from "lucide-react";

/**
 * Écran RH — Aperçu des variables de paie (Étage 2), LECTURE SEULE.
 *
 * Consomme GET /api/payroll/preview (admin only). N'affiche QUE des quantités
 * qualifiées (heures, jours, minutes) — JAMAIS d'euros, de taux, de cotisation
 * ni de net/brut. Aucune écriture : pas de persistance, pas de verrouillage.
 * La valorisation reste au moteur de paie externe / expert-comptable.
 */

interface PayrollVariables {
  totalWorkedHours: number;
  normalHours: number;
  overtimeHours: number;
  complementaryHours: number;
  sundayHours: number;
  holidayHours: number;
  paidLeaveDays: number;
  sickOrAccidentDays: number;
  otherAbsenceDays: number;
  latenessMinutes: number;
}

interface PayrollRow {
  contractId: string;
  variables: PayrollVariables;
}

interface PreviewResponse {
  storeId: string;
  period: string;
  companySiren: string | null;
  rows: PayrollRow[];
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(period: string, dir: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

export default function PaiePage() {
  const [storeId, setStoreId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  // Noms employés pour rendre les lignes lisibles (lecture seule, admin).
  useEffect(() => {
    fetch("/api/employees?limit=500")
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((d) => {
        const map = new Map<string, string>();
        for (const e of d.employees || []) {
          map.set(e.id, `${e.firstName} ${e.lastName}`);
        }
        setNames(map);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!storeId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/payroll/preview?storeId=${encodeURIComponent(storeId)}&period=${period}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors du calcul de l'aperçu");
        setData(null);
      } else {
        setData(json.data ?? json);
      }
    } catch {
      setError("Erreur réseau");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, period]);

  useEffect(() => {
    load();
  }, [load]);

  function downloadCsv() {
    if (!storeId) return;
    const url = `/api/payroll/preview?storeId=${encodeURIComponent(storeId)}&period=${period}&format=csv`;
    window.open(url, "_blank");
  }

  const rows = data?.rows ?? [];

  // Totaux (quantités) pour la période affichée.
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalWorkedHours += r.variables.totalWorkedHours;
      acc.overtimeHours += r.variables.overtimeHours;
      acc.complementaryHours += r.variables.complementaryHours;
      acc.sundayHours += r.variables.sundayHours;
      acc.holidayHours += r.variables.holidayHours;
      acc.paidLeaveDays += r.variables.paidLeaveDays;
      acc.sickOrAccidentDays += r.variables.sickOrAccidentDays;
      acc.latenessMinutes += r.variables.latenessMinutes;
      return acc;
    },
    {
      totalWorkedHours: 0,
      overtimeHours: 0,
      complementaryHours: 0,
      sundayHours: 0,
      holidayHours: 0,
      paidLeaveDays: 0,
      sickOrAccidentDays: 0,
      latenessMinutes: 0,
    }
  );

  return (
    <div>
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-4 sm:mb-6 gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Variables de paie</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
            Aperçu mensuel des quantités qualifiées — lecture seule
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={downloadCsv}
          disabled={!storeId || rows.length === 0}
        >
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Bandeau frontière */}
      <div className="mb-4 flex items-start gap-2 text-xs sm:text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Ces données sont des <strong>quantités qualifiées</strong> (heures, jours, minutes) calculées
          à la volée depuis les pointages et absences validés. Aucune valorisation en euros n&apos;est
          effectuée ici : la transformation en montants relève du moteur de paie / expert-comptable.
        </span>
      </div>

      {/* Sélecteurs */}
      <div className="space-y-3 mb-4 sm:mb-6">
        <div className="w-full lg:w-72">
          <StoreSearch value={storeId} onChange={setStoreId} placeholder="Sélectionner une boutique..." />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPeriod(shiftPeriod(period, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setPeriod(currentPeriod())}>
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Mois courant
          </Button>
          <span className="text-xs sm:text-sm font-medium text-gray-700 text-center flex-1 sm:flex-none capitalize">
            {periodLabel(period)}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPeriod(shiftPeriod(period, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Corps */}
      {!storeId ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Sélectionnez une boutique pour afficher les variables de paie</p>
        </div>
      ) : loading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">
          Chargement...
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-lg p-8 text-center text-red-600">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun pointage pour cette boutique sur {periodLabel(period)}</p>
        </div>
      ) : (
        <>
          {/* Totaux période */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Heures travaillées" value={`${totals.totalWorkedHours}h`} accent />
            <SummaryCard label="Heures supplémentaires" value={`${totals.overtimeHours}h`} />
            <SummaryCard label="Heures complémentaires" value={`${totals.complementaryHours}h`} />
            <SummaryCard label="Heures dimanche" value={`${totals.sundayHours}h`} />
            <SummaryCard label="Heures fériées" value={`${totals.holidayHours}h`} />
            <SummaryCard label="Jours congés payés" value={`${totals.paidLeaveDays}`} />
            <SummaryCard label="Jours arrêt (mal./acc.)" value={`${totals.sickOrAccidentDays}`} />
            <SummaryCard label="Retards cumulés" value={`${totals.latenessMinutes} min`} />
          </div>

          {/* Cartes (mobile) */}
          <div className="space-y-2 lg:hidden">
            {rows.map((r) => (
              <div key={r.contractId} className="bg-white border border-gray-200 rounded-lg p-3">
                <p className="font-medium text-sm mb-2">{names.get(r.contractId) || r.contractId}</p>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <Cell label="Travaillées" value={`${r.variables.totalWorkedHours}h`} />
                  <Cell label="Sup." value={`${r.variables.overtimeHours}h`} />
                  <Cell label="Compl." value={`${r.variables.complementaryHours}h`} />
                  <Cell label="Dimanche" value={`${r.variables.sundayHours}h`} />
                  <Cell label="Fériées" value={`${r.variables.holidayHours}h`} />
                  <Cell label="CP" value={`${r.variables.paidLeaveDays}j`} />
                  <Cell label="Arrêt" value={`${r.variables.sickOrAccidentDays}j`} />
                  <Cell label="Autres abs." value={`${r.variables.otherAbsenceDays}j`} />
                  <Cell label="Retard" value={`${r.variables.latenessMinutes}min`} />
                </div>
              </div>
            ))}
          </div>

          {/* Table (desktop) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Employé</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Travaillées</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Normales</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Sup.</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Compl.</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Dimanche</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Fériées</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">CP</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Arrêt</th>
                  <th className="text-right px-3 py-2.5 font-medium text-gray-500">Autres</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500">Retard</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.contractId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{names.get(r.contractId) || r.contractId}</td>
                    <td className="px-3 py-2 text-right">{r.variables.totalWorkedHours}h</td>
                    <td className="px-3 py-2 text-right text-gray-600">{r.variables.normalHours}h</td>
                    <td className="px-3 py-2 text-right text-orange-600">{r.variables.overtimeHours}h</td>
                    <td className="px-3 py-2 text-right text-amber-600">{r.variables.complementaryHours}h</td>
                    <td className="px-3 py-2 text-right">{r.variables.sundayHours}h</td>
                    <td className="px-3 py-2 text-right">{r.variables.holidayHours}h</td>
                    <td className="px-3 py-2 text-right text-blue-600">{r.variables.paidLeaveDays}j</td>
                    <td className="px-3 py-2 text-right text-red-600">{r.variables.sickOrAccidentDays}j</td>
                    <td className="px-3 py-2 text-right text-gray-500">{r.variables.otherAbsenceDays}j</td>
                    <td className="px-4 py-2 text-right text-gray-500">{r.variables.latenessMinutes}min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data?.companySiren && (
            <p className="mt-3 text-xs text-gray-400">
              SIREN société : {data.companySiren} · {rows.length} contrat(s) · période {period}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 sm:p-4 ${accent ? "bg-gray-900 text-white" : "bg-white border border-gray-200"}`}>
      <p className={`text-[10px] sm:text-xs ${accent ? "text-gray-400" : "text-gray-500"}`}>{label}</p>
      <p className={`text-lg sm:text-xl font-bold mt-0.5 sm:mt-1 ${accent ? "text-white" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded px-1.5 py-1 text-center">
      <span className="text-gray-400 block text-[10px]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
