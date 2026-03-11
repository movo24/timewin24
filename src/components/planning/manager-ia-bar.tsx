"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Send,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Lightbulb,
  ChevronUp,
  ChevronDown,
  Users,
  Calendar,
  Clock,
  Search,
  BarChart3,
  ShieldAlert,
  Info,
  TrendingUp,
  UserCheck,
} from "lucide-react";

// ─── Types (mirror API response) ────────────────

interface ProposalAction {
  type: "create" | "update" | "delete";
  shiftId?: string;
  storeId: string;
  storeName: string;
  employeeId: string | null;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  explanation: string;
}

interface Alternative {
  description: string;
  actions: ProposalAction[];
}

interface AvailableEmployee {
  id: string;
  firstName: string;
  lastName: string;
  reason: string;
}

interface PlanningIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  date?: string;
  storeName?: string;
  employeeName?: string;
}

interface PlanningScore {
  total: number;
  label: string;
  breakdown: {
    coverage: number;
    hoursBalance: number;
    breaksRespected: number;
    restRespected: number;
    unassignedPenalty: number;
  };
}

interface EmployeeScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
  storeName: string;
  hours: number;
}

interface QueryResult {
  type: "available" | "schedule" | "hours" | "analysis" | "score" | "replacement";
  availableEmployees?: AvailableEmployee[];
  schedule?: EmployeeScheduleEntry[];
  totalHours?: number;
  contractHours?: number | null;
  issues?: PlanningIssue[];
  score?: PlanningScore;
}

interface Proposal {
  actions: ProposalAction[];
  warnings: string[];
  alternatives: Alternative[];
  explanation: string;
  queryResult?: QueryResult;
  parsedIntent: {
    action: string;
    employeeName: string | null;
    storeName: string | null;
    dateExpr: string | null;
    rawCommand: string;
  };
}

interface ExecutionResult {
  success: boolean;
  applied: number;
  errors: string[];
}

// ─── Props ──────────────────────────────────────

interface ManagerIABarProps {
  weekStart: string;
  storeId: string;
  onApplied: () => void;
}

// ─── Action Type Labels ─────────────────────────

const ACTION_ICONS: Record<string, typeof Plus> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

const ACTION_COLORS: Record<string, string> = {
  create: "text-green-600 bg-green-50 border-green-200",
  update: "text-blue-600 bg-blue-50 border-blue-200",
  delete: "text-red-600 bg-red-50 border-red-200",
};

// ─── Example Commands ───────────────────────────

const EXAMPLE_COMMANDS = [
  { label: "Actions", items: [
    "Mets Zakaria demain matin à Quai Châtelet",
    "Supprime le shift de Mohamed mardi",
    "Déplace le shift de Yassin de mardi à mercredi",
    "Remplis les trous de couverture lundi",
  ]},
  { label: "Questions", items: [
    "Qui travaille demain ?",
    "Qui peut couvrir vendredi soir ?",
    "Combien d'heures a Zakaria cette semaine ?",
    "Analyse le planning",
    "Quel est le score du planning ?",
    "Trouve un remplaçant pour Mohamed mardi",
  ]},
];

// ─── Date Formatter ─────────────────────────────

function formatDateFr(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

// ─── Score Color ────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Severity Config ────────────────────────────

const SEVERITY_CONFIG = {
  critical: { icon: ShieldAlert, color: "text-red-700 bg-red-50 border-red-200" },
  warning: { icon: AlertTriangle, color: "text-amber-700 bg-amber-50 border-amber-200" },
  info: { icon: Info, color: "text-blue-700 bg-blue-50 border-blue-200" },
};

// ─── Query Result Panel ─────────────────────────

function QueryResultPanel({ queryResult }: { queryResult: QueryResult }) {
  switch (queryResult.type) {
    case "available":
    case "replacement":
      return (
        <div className="px-4 pb-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <Users className="h-3.5 w-3.5" />
            {queryResult.type === "replacement" ? "Remplaçants possibles" : "Employés disponibles"}
          </div>
          {queryResult.availableEmployees && queryResult.availableEmployees.length > 0 ? (
            queryResult.availableEmployees.map((emp, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-green-50 border border-green-200"
              >
                <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-green-800">
                    {emp.firstName} {emp.lastName}
                  </span>
                  <span className="text-xs text-green-600 ml-2">{emp.reason}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 italic p-2">Aucun employé disponible.</div>
          )}
        </div>
      );

    case "schedule":
      return (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <Calendar className="h-3.5 w-3.5" />
            Planning
          </div>
          {queryResult.schedule && queryResult.schedule.length > 0 ? (
            <div className="space-y-1">
              {queryResult.schedule.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-2 rounded-lg bg-blue-50 border border-blue-200"
                >
                  <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                    <span className="font-medium text-blue-800">{formatDateFr(entry.date)}</span>
                    <span className="text-blue-600">{entry.startTime}–{entry.endTime}</span>
                    <span className="text-blue-500 text-xs">({entry.hours.toFixed(1)}h)</span>
                    <span className="text-gray-500 text-xs ml-auto">{entry.storeName}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic p-2">Aucun shift trouvé.</div>
          )}
          {queryResult.totalHours !== undefined && (
            <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Total : {queryResult.totalHours.toFixed(1)}h
              {queryResult.contractHours != null && (
                <span> / {queryResult.contractHours}h contrat</span>
              )}
            </div>
          )}
        </div>
      );

    case "hours":
      return (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <Clock className="h-3.5 w-3.5" />
            Heures de la semaine
          </div>
          {queryResult.schedule && queryResult.schedule.length > 0 ? (
            <div className="space-y-1">
              {queryResult.schedule.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200"
                >
                  <span className="text-sm text-gray-700">{formatDateFr(entry.date)}</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">{entry.startTime}–{entry.endTime}</span>
                    <span className="font-medium text-gray-700">{entry.hours.toFixed(1)}h</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 p-2 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-between">
            <span className="text-sm font-medium text-violet-800">Total</span>
            <span className="text-sm font-bold text-violet-700">
              {(queryResult.totalHours ?? 0).toFixed(1)}h
              {queryResult.contractHours != null && (
                <span className="font-normal text-violet-500"> / {queryResult.contractHours}h</span>
              )}
            </span>
          </div>
        </div>
      );

    case "analysis":
      return (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <Search className="h-3.5 w-3.5" />
            Analyse du planning
          </div>
          {queryResult.issues && queryResult.issues.length > 0 ? (
            <div className="space-y-1.5">
              {queryResult.issues.map((issue, i) => {
                const config = SEVERITY_CONFIG[issue.severity];
                const Icon = config.icon;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2.5 rounded-lg border ${config.color}`}
                  >
                    <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs">{issue.message}</span>
                      {(issue.date || issue.storeName || issue.employeeName) && (
                        <div className="text-xs opacity-75 mt-0.5">
                          {issue.date && formatDateFr(issue.date)}
                          {issue.storeName && ` • ${issue.storeName}`}
                          {issue.employeeName && ` • ${issue.employeeName}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Aucun problème détecté !
            </div>
          )}
        </div>
      );

    case "score":
      if (!queryResult.score) return null;
      const { score } = queryResult;
      const dimensions = [
        { label: "Couverture", value: score.breakdown.coverage },
        { label: "Équilibre heures", value: score.breakdown.hoursBalance },
        { label: "Pauses", value: score.breakdown.breaksRespected },
        { label: "Repos", value: score.breakdown.restRespected },
        { label: "Non-assignés", value: score.breakdown.unassignedPenalty },
      ];
      return (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-3">
            <BarChart3 className="h-3.5 w-3.5" />
            Score qualité du planning
          </div>
          {/* Main score */}
          <div className="flex items-center gap-3 mb-3">
            <div className={`text-3xl font-bold ${scoreColor(score.total)}`}>
              {score.total}
            </div>
            <div>
              <div className={`text-sm font-medium ${scoreColor(score.total)}`}>{score.label}</div>
              <div className="text-xs text-gray-500">sur 100</div>
            </div>
          </div>
          {/* Breakdown bars */}
          <div className="space-y-2">
            {dimensions.map((dim, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-gray-600">{dim.label}</span>
                  <span className={`font-medium ${scoreColor(dim.value)}`}>{dim.value}</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scoreBgColor(dim.value)}`}
                    style={{ width: `${dim.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ─── Component ──────────────────────────────────

export function ManagerIABar({
  weekStart,
  storeId,
  onApplied,
}: ManagerIABarProps) {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isQueryMode = proposal?.queryResult != null;

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Reset when closed
  function handleClose() {
    setOpen(false);
    setCommand("");
    setProposal(null);
    setResult(null);
    setShowExamples(false);
  }

  // Send command
  async function handleSend() {
    if (!command.trim() || loading) return;

    setLoading(true);
    setProposal(null);
    setResult(null);

    try {
      const res = await fetch("/api/planning/manager-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: command.trim(),
          weekStart,
          storeId: storeId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setProposal({
          actions: [],
          warnings: [data.error || "Erreur serveur"],
          alternatives: [],
          explanation: data.error || "Erreur lors du traitement de la commande.",
          parsedIntent: { action: "", employeeName: null, storeName: null, dateExpr: null, rawCommand: command },
        });
      } else {
        setProposal(data.proposal);
      }
    } catch {
      setProposal({
        actions: [],
        warnings: ["Erreur réseau"],
        alternatives: [],
        explanation: "Impossible de contacter le serveur.",
        parsedIntent: { action: "", employeeName: null, storeName: null, dateExpr: null, rawCommand: command },
      });
    } finally {
      setLoading(false);
    }
  }

  // Apply proposal
  async function handleApply() {
    if (!proposal || proposal.actions.length === 0 || applying) return;

    setApplying(true);

    try {
      const res = await fetch("/api/planning/manager-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: command.trim(),
          weekStart,
          storeId: storeId || undefined,
          execute: true,
        }),
      });

      const data = await res.json();

      if (data.result) {
        setResult(data.result);
        if (data.result.success) {
          onApplied();
          // Auto-close after success
          setTimeout(() => {
            setCommand("");
            setProposal(null);
            setResult(null);
          }, 2000);
        }
      }
    } catch {
      setResult({ success: false, applied: 0, errors: ["Erreur réseau"] });
    } finally {
      setApplying(false);
    }
  }

  // Apply alternative
  async function handleApplyAlternative(alt: Alternative) {
    if (applying) return;

    setProposal((prev) =>
      prev ? { ...prev, actions: alt.actions, alternatives: [], explanation: alt.description } : prev
    );
  }

  // Closed state: floating button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 lg:bottom-8 lg:left-auto lg:right-24 z-40 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">Manager IA</span>
      </button>
    );
  }

  // Open state
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Backdrop */}
      {proposal && (
        <div
          className="fixed inset-0 bg-black/10 z-40"
          onClick={() => {
            if (!loading && !applying) {
              setProposal(null);
              setResult(null);
            }
          }}
        />
      )}

      {/* Proposal / Query Result panel */}
      {proposal && (
        <div className="relative z-50 max-w-2xl mx-auto mb-2 px-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[70vh] overflow-y-auto">
            {/* Header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-medium text-gray-700">
                  {isQueryMode ? "Réponse" : "Proposition"}
                </span>
              </div>
              <button
                onClick={() => { setProposal(null); setResult(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Explanation */}
            <div className="px-4 py-3">
              <p className="text-sm text-gray-700">{proposal.explanation}</p>
            </div>

            {/* Query Result (conversational mode) */}
            {isQueryMode && proposal.queryResult && (
              <QueryResultPanel queryResult={proposal.queryResult} />
            )}

            {/* Actions (action mode) */}
            {proposal.actions.length > 0 && (
              <div className="px-4 pb-3 space-y-2">
                {proposal.actions.map((action, i) => {
                  const Icon = ACTION_ICONS[action.type] || Plus;
                  const colorClass = ACTION_COLORS[action.type] || "";
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${colorClass}`}
                    >
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {action.employeeName}
                          {action.type !== "delete" && (
                            <span className="font-normal text-gray-500">
                              {" "}— {action.storeName}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatDateFr(action.date)} • {action.startTime}–{action.endTime}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Warnings */}
            {proposal.warnings.length > 0 && (
              <div className="px-4 pb-3">
                {proposal.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-md p-2 mb-1"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Alternatives */}
            {proposal.alternatives.length > 0 && (
              <div className="px-4 pb-3">
                <div className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Alternatives
                </div>
                {proposal.alternatives.map((alt, i) => (
                  <button
                    key={i}
                    onClick={() => handleApplyAlternative(alt)}
                    className="w-full text-left text-xs text-blue-700 bg-blue-50 rounded-md p-2.5 mb-1 hover:bg-blue-100 transition-colors border border-blue-200"
                  >
                    {alt.description}
                    {alt.actions.map((a, j) => (
                      <span key={j} className="block text-blue-500 mt-0.5">
                        → {a.employeeName} {formatDateFr(a.date)} {a.startTime}–{a.endTime}
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="px-4 pb-3">
                <div
                  className={`flex items-center gap-2 p-2.5 rounded-md text-sm ${
                    result.success
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {result.success ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  <span>
                    {result.success
                      ? `${result.applied} action(s) appliquée(s) avec succès`
                      : `Erreur : ${result.errors.join(", ")}`}
                  </span>
                </div>
              </div>
            )}

            {/* Action buttons (only for action mode, not queries) */}
            {proposal.actions.length > 0 && !result && !isQueryMode && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setProposal(null); setResult(null); }}
                  disabled={applying}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApply}
                  disabled={applying}
                >
                  {applying ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Application...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      Appliquer
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* For queries with proposed actions (e.g. FIND_REPLACEMENT), show apply */}
            {proposal.actions.length > 0 && !result && isQueryMode && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center sticky bottom-0">
                <span className="text-xs text-gray-500">
                  {proposal.actions.length} action(s) proposée(s)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setProposal(null); setResult(null); }}
                    disabled={applying}
                  >
                    Fermer
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleApply}
                    disabled={applying}
                  >
                    {applying ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Application...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Appliquer
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Command bar */}
      <div className="relative z-50 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {/* Examples toggle */}
          {showExamples && !loading && !proposal && (
            <div className="mb-2">
              {EXAMPLE_COMMANDS.map((group, gi) => (
                <div key={gi} className="mb-2">
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
                    {group.label}
                  </div>
                  {group.items.map((ex, i) => (
                    <button
                      key={i}
                      className="block w-full text-left text-xs text-gray-500 hover:text-violet-600 hover:bg-violet-50 rounded px-2 py-1.5 transition-colors"
                      onClick={() => {
                        setCommand(ex);
                        setShowExamples(false);
                        inputRef.current?.focus();
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Close button */}
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Sparkle icon */}
            <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
                if (e.key === "Escape") handleClose();
              }}
              placeholder="Commande ou question... Ex: Qui travaille demain ?"
              className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-gray-400"
              disabled={loading || applying}
            />

            {/* Examples button */}
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="text-gray-400 hover:text-gray-600 shrink-0"
              title="Exemples de commandes"
            >
              {showExamples ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </button>

            {/* Send button */}
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white shrink-0 h-8 px-3"
              onClick={handleSend}
              disabled={!command.trim() || loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
