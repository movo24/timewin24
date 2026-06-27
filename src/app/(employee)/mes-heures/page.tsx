"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, Clock, Info } from "lucide-react";

/**
 * Écran salarié « Mes heures » — consultation LECTURE SEULE de ses propres
 * quantités d'heures qualifiées (Étage 2) pour un mois. Consomme
 * GET /api/payroll/me. Aucune écriture, aucun euro : ce sont des quantités
 * (heures, jours, minutes), pas une rémunération. La valorisation relève du
 * bulletin de paie émis par l'employeur / l'expert-comptable.
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
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export default function MesHeuresPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [variables, setVariables] = useState<PayrollVariables | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/me?period=${period}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors du calcul de vos heures");
        setVariables(null);
      } else {
        setVariables((json.data ?? json).variables);
      }
    } catch {
      setError("Erreur réseau");
      setVariables(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const isFuture = period > currentPeriod();

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mes heures</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
          Récapitulatif mensuel de vos heures et absences
        </p>
      </div>

      {/* Bandeau d'information */}
      <div className="mb-4 flex items-start gap-2 text-xs sm:text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Ces chiffres sont des <strong>quantités</strong> (heures, jours) issues de vos pointages et
          absences validés. Ils ne constituent pas un bulletin de paie : le calcul de votre
          rémunération est effectué par votre employeur.
        </span>
      </div>

      {/* Navigation mensuelle */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-4 sm:mb-6">
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
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setPeriod(shiftPeriod(period, 1))}
          disabled={isFuture}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">Chargement...</div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-lg p-8 text-center text-red-600">{error}</div>
      ) : !variables ||
        (variables.totalWorkedHours === 0 &&
          variables.paidLeaveDays === 0 &&
          variables.sickOrAccidentDays === 0 &&
          variables.otherAbsenceDays === 0) ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucune heure ni absence enregistrée sur {periodLabel(period)}</p>
        </div>
      ) : (
        <>
          {/* Carte principale : heures travaillées */}
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-lg p-4 sm:p-6 mb-4">
            <p className="text-xs sm:text-sm text-gray-400 mb-1">Heures travaillées ce mois</p>
            <p className="text-3xl sm:text-4xl font-bold">{variables.totalWorkedHours}h</p>
            <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Heures normales</p>
                <p className="font-semibold">{variables.normalHours}h</p>
              </div>
              <div>
                <p className="text-gray-400">Heures supplémentaires</p>
                <p className="font-semibold">{variables.overtimeHours}h</p>
              </div>
            </div>
          </div>

          {/* Détail des qualifications */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Heures complémentaires" value={`${variables.complementaryHours}h`} />
            <StatCard label="Heures le dimanche" value={`${variables.sundayHours}h`} />
            <StatCard label="Heures jours fériés" value={`${variables.holidayHours}h`} />
            <StatCard label="Retards cumulés" value={`${variables.latenessMinutes} min`} />
            <StatCard label="Jours de congés payés" value={`${variables.paidLeaveDays}`} />
            <StatCard label="Jours d'arrêt (mal./acc.)" value={`${variables.sickOrAccidentDays}`} />
            <StatCard label="Autres absences" value={`${variables.otherAbsenceDays}`} />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
      <p className="text-[10px] sm:text-xs text-gray-500">{label}</p>
      <p className="text-lg sm:text-xl font-bold mt-0.5 sm:mt-1 text-gray-900">{value}</p>
    </div>
  );
}
