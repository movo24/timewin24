"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertTriangle,
  Check,
  Clock,
  Users,
  Calendar,
  Zap,
  ChevronDown,
  ChevronUp,
  Store,
  Brain,
  Lightbulb,
  Sliders,
} from "lucide-react";

// ─── Types ──────────────────────────────────────

interface GeneratedShift {
  employeeId: string | null;
  employeeName: string;
  storeId: string;
  storeName: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  breakMinutes: number;
  warnings: string[];
}

interface SolverResult {
  shifts: GeneratedShift[];
  warnings: string[];
  stats: {
    totalShiftsGenerated: number;
    assignedCount: number;
    unassignedCount: number;
    totalHoursGenerated: number;
    daysFullyCovered: number;
    daysPartiallyCovered: number;
    daysUncovered: number;
    employeesUsed: number;
    solveTimeMs: number;
  };
  savedShiftIds?: string[];
  message?: string;
}

interface ScenarioScoreBreakdown {
  coverageCompleteness: number;
  shiftDurationQuality: number;
  employeeBalance: number;
  constraintRespect: number;
  costEfficiency: number;
  breakQuality: number;
}

interface ScenarioScore {
  total: number;
  breakdown: ScenarioScoreBreakdown;
  label: string;
}

interface ScoredScenario {
  id: string;
  params: {
    shiftDurationHours: number;
    scoringProfile: string;
    assignmentOrder: string;
  };
  result: SolverResult;
  score: ScenarioScore;
}

interface CrossStoreSuggestion {
  type: string;
  employeeId: string;
  employeeName: string;
  fromStoreId: string;
  fromStoreName: string;
  toStoreId: string;
  toStoreName: string;
  date: string;
  reason: string;
  impact: string;
}

interface ScenarioApiResult {
  best: ScoredScenario;
  alternatives: ScoredScenario[];
  suggestions: CrossStoreSuggestion[];
  totalScenariosEvaluated: number;
  totalTimeMs: number;
}

// ─── Score Labels ───────────────────────────────

const SCORE_LABELS: Record<string, string> = {
  coverageCompleteness: "Couverture",
  shiftDurationQuality: "Durée shifts",
  employeeBalance: "Équilibre",
  constraintRespect: "Contraintes",
  costEfficiency: "Coût",
  breakQuality: "Pauses",
};

function getScoreColor(score: number): string {
  if (score >= 85) return "text-green-700 bg-green-100";
  if (score >= 70) return "text-blue-700 bg-blue-100";
  if (score >= 50) return "text-amber-700 bg-amber-100";
  return "text-red-700 bg-red-100";
}

function getBarColor(score: number): string {
  if (score >= 85) return "bg-green-500";
  if (score >= 70) return "bg-blue-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Component Props ────────────────────────────

interface AutoPlanModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (firstStoreId?: string) => void;
  storeId?: string;
  weekStart: string;
}

const DAY_NAMES: Record<string, string> = {};
function getDayName(dateStr: string): string {
  if (DAY_NAMES[dateStr]) return DAY_NAMES[dateStr];
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const name = date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  DAY_NAMES[dateStr] = name;
  return name;
}

// ─── Main Component ─────────────────────────────

export function AutoPlanModal({
  open,
  onClose,
  onSaved,
  storeId,
  weekStart,
}: AutoPlanModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SolverResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shiftDuration, setShiftDuration] = useState(7);
  const [showWarnings, setShowWarnings] = useState(false);
  const [useScenarios, setUseScenarios] = useState(true);
  const [scenarioData, setScenarioData] = useState<ScenarioApiResult | null>(null);

  const isMultiStore = !storeId;

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setScenarioData(null);

    try {
      const res = await fetch("/api/planning/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeId || "",
          weekStart,
          mode: "preview",
          shiftDurationHours: useScenarios ? 6 : shiftDuration,
          shiftGranularity: 60,
          useScenarios,
          idealShiftRange: useScenarios ? [4, 6] : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la génération");
        setLoading(false);
        return;
      }

      if (useScenarios && data.best) {
        // Scenario response
        setScenarioData(data as ScenarioApiResult);
        const bestResult = data.best.result;
        setResult(bestResult);
        setSelected(new Set(bestResult.shifts.map((_: GeneratedShift, i: number) => i)));
      } else {
        // Classic response
        setScenarioData(null);
        setResult(data);
        setSelected(new Set(data.shifts.map((_: GeneratedShift, i: number) => i)));
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [storeId, weekStart, shiftDuration, useScenarios]);

  useEffect(() => {
    if (open && weekStart) {
      runPreview();
    }
    if (!open) {
      setResult(null);
      setScenarioData(null);
      setError("");
      setSelected(new Set());
    }
  }, [open, weekStart, runPreview]);

  function toggleShift(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  }

  function selectAll() {
    if (result) setSelected(new Set(result.shifts.map((_, i) => i)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    if (!result || selected.size === 0) return;
    setSaving(true);
    setError("");

    const selectedShifts = result.shifts.filter((_, i) => selected.has(i));
    let saved = 0;
    let errors = 0;

    for (const shift of selectedShifts) {
      try {
        const res = await fetch("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: shift.storeId,
            employeeId: shift.employeeId || null,
            date: shift.date,
            startTime: shift.startTime,
            endTime: shift.endTime,
            note: `Auto-planifié — ${shift.storeName}${shift.breakMinutes > 0 ? ` — pause ${shift.breakMinutes}min` : ""}`,
          }),
        });
        if (res.ok) saved++;
        else errors++;
      } catch {
        errors++;
      }
    }

    setSaving(false);
    if (saved > 0) {
      const firstStoreId = selectedShifts[0]?.storeId;
      onClose();
      onSaved(firstStoreId);
    } else {
      setError(`Aucun shift enregistré — ${errors} erreur(s)`);
    }
  }

  // Group shifts by date, then by store within each date
  const shiftsByDateStore = new Map<string, { shift: GeneratedShift; index: number }[]>();
  if (result) {
    for (let i = 0; i < result.shifts.length; i++) {
      const s = result.shifts[i];
      const key = s.date;
      if (!shiftsByDateStore.has(key)) shiftsByDateStore.set(key, []);
      shiftsByDateStore.get(key)!.push({ shift: s, index: i });
    }
  }
  const sortedDates = Array.from(shiftsByDateStore.keys()).sort();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Auto-planification {isMultiStore ? "— Tous les magasins" : ""}
          </DialogTitle>
          <DialogDescription>
            {useScenarios
              ? "Mode intelligent : évalue plusieurs scénarios et choisit le meilleur."
              : isMultiStore
                ? "Génération du planning optimal pour tous les magasins en même temps."
                : "Génération automatique des shifts optimaux pour la semaine."}
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle + Duration config */}
        <div className="flex items-center gap-3 py-2 border-b border-gray-100">
          {/* Mode toggle */}
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
              useScenarios
                ? "bg-violet-100 text-violet-700 border border-violet-200"
                : "bg-gray-100 text-gray-600 border border-gray-200"
            }`}
            onClick={() => setUseScenarios(!useScenarios)}
            disabled={loading}
          >
            {useScenarios ? (
              <><Brain className="h-3.5 w-3.5" /> Intelligent</>
            ) : (
              <><Sliders className="h-3.5 w-3.5" /> Manuel</>
            )}
          </button>

          {useScenarios ? (
            <span className="text-xs text-gray-400">4-6h idéal, 8h max</span>
          ) : (
            <div className="flex items-center gap-1">
              {[6, 7, 8, 9, 10].map((h) => (
                <button
                  key={h}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    shiftDuration === h
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  onClick={() => setShiftDuration(h)}
                  disabled={loading}
                >
                  {h}h
                </button>
              ))}
            </div>
          )}

          {result && !loading && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-xs"
              onClick={runPreview}
            >
              Recalculer
            </Button>
          )}
        </div>

        {loading && (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              {useScenarios
                ? "Évaluation de plusieurs scénarios..."
                : `Calcul du planning optimal${isMultiStore ? " (tous magasins)" : ""}...`}
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        {result && !loading && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {result.stats.totalShiftsGenerated}
                </div>
                <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Calendar className="h-3 w-3" /> Shifts
                  {result.stats.unassignedCount > 0 && (
                    <span className="text-amber-500">({result.stats.unassignedCount} à pourvoir)</span>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {result.stats.totalHoursGenerated.toFixed(0)}h
                </div>
                <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> Heures
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {result.stats.employeesUsed}
                </div>
                <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Users className="h-3 w-3" /> Employés
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {scenarioData ? `${scenarioData.totalTimeMs}ms` : `${result.stats.solveTimeMs}ms`}
                </div>
                <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Zap className="h-3 w-3" /> Temps
                </div>
              </div>
            </div>

            {/* Scenario Score */}
            {scenarioData && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">
                      Score : {scenarioData.best.score.total}/100
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getScoreColor(scenarioData.best.score.total)}`}>
                    {scenarioData.best.score.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                  {Object.entries(scenarioData.best.score.breakdown).map(([key, val]) => (
                    <div key={key} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-gray-500">{SCORE_LABELS[key] || key}</span>
                        <span className="text-gray-700 font-medium">{Math.round(val)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${getBarColor(val)}`}
                          style={{ width: `${val}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                  <span>
                    {scenarioData.totalScenariosEvaluated} scénarios évalués
                  </span>
                  <span>
                    Meilleur : durée {scenarioData.best.params.shiftDurationHours}h, profil {scenarioData.best.params.scoringProfile}
                  </span>
                </div>
              </div>
            )}

            {/* Cross-store Suggestions */}
            {scenarioData && scenarioData.suggestions && scenarioData.suggestions.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="text-sm font-medium text-blue-800 mb-1.5 flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4" />
                  Suggestions
                </div>
                {scenarioData.suggestions.map((s, i) => (
                  <div key={i} className="text-xs text-blue-700 mb-1">
                    • {s.reason} : <strong>{s.employeeName}</strong> de {s.fromStoreName} vers {s.toStoreName} — {s.impact}
                  </div>
                ))}
              </div>
            )}

            {/* Coverage */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {result.stats.daysFullyCovered > 0 && (
                <span className="flex items-center gap-1 text-green-600">
                  <Check className="h-3 w-3" /> {result.stats.daysFullyCovered} complet(s)
                </span>
              )}
              {result.stats.daysPartiallyCovered > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> {result.stats.daysPartiallyCovered} partiel(s)
                </span>
              )}
              {result.stats.daysUncovered > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-3 w-3" /> {result.stats.daysUncovered} non couvert(s)
                </span>
              )}
            </div>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md">
                <button
                  className="flex items-center justify-between w-full px-3 py-2 text-sm text-amber-700"
                  onClick={() => setShowWarnings(!showWarnings)}
                >
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    {result.warnings.length} avertissement(s)
                  </span>
                  {showWarnings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showWarnings && (
                  <ul className="px-3 pb-2 space-y-1">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-600">• {w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Shifts table */}
            {result.shifts.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {selected.size}/{result.shifts.length} sélectionné(s)
                  </span>
                  <div className="flex gap-2">
                    <button className="text-xs text-blue-600 hover:underline" onClick={selectAll}>
                      Tout sélectionner
                    </button>
                    <button className="text-xs text-gray-500 hover:underline" onClick={deselectAll}>
                      Tout désélectionner
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                  {sortedDates.map((date) => {
                    const dayShifts = shiftsByDateStore.get(date)!;
                    // Group by store within the day
                    const byStore = new Map<string, typeof dayShifts>();
                    for (const item of dayShifts) {
                      const key = item.shift.storeName;
                      if (!byStore.has(key)) byStore.set(key, []);
                      byStore.get(key)!.push(item);
                    }

                    return (
                      <div key={date}>
                        <div className="text-xs font-medium text-gray-500 uppercase mb-1.5 sticky top-0 bg-white py-1">
                          {getDayName(date)}
                        </div>
                        {Array.from(byStore.entries()).map(([storeName, storeShifts]) => (
                          <div key={storeName} className="mb-2">
                            {isMultiStore && (
                              <div className="flex items-center gap-1 text-xs text-gray-400 mb-1 ml-1">
                                <Store className="h-3 w-3" />
                                {storeName}
                              </div>
                            )}
                            <div className="space-y-1">
                              {storeShifts.map(({ shift, index }) => {
                                const isUnassigned = !shift.employeeId;
                                return (
                                <label
                                  key={index}
                                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                                    isUnassigned
                                      ? selected.has(index)
                                        ? "bg-amber-50 border-amber-300"
                                        : "bg-amber-50/50 border-amber-200 opacity-60"
                                      : selected.has(index)
                                        ? "bg-blue-50 border-blue-200"
                                        : "bg-white border-gray-100 opacity-60"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected.has(index)}
                                    onChange={() => toggleShift(index)}
                                    className="rounded border-gray-300"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-sm font-medium truncate ${isUnassigned ? "text-amber-700" : "text-gray-900"}`}>
                                      {shift.employeeName}
                                      {isUnassigned && (
                                        <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-normal">
                                          à pourvoir
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {shift.startTime} – {shift.endTime} ({shift.hours.toFixed(1)}h)
                                      {shift.breakMinutes > 0 && (
                                        <span className="text-amber-600 ml-1">— pause {shift.breakMinutes}min</span>
                                      )}
                                      {!isMultiStore ? "" : ` • ${shift.storeName}`}
                                    </div>
                                  </div>
                                  {shift.warnings.length > 0 && (
                                    <span title={shift.warnings.join("\n")}>
                                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                    </span>
                                  )}
                                </label>
                              );})}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-gray-500">
                Aucun shift à générer. Vérifiez les horaires et les employés assignés.
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              {result.shifts.length > 0 && (
                <Button onClick={handleSave} disabled={saving || selected.size === 0}>
                  {saving ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Enregistrement...</>
                  ) : (
                    <><Check className="h-4 w-4 mr-1.5" />Enregistrer {selected.size} shift(s)</>
                  )}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
