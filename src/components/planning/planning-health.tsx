"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Activity,
} from "lucide-react";

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

interface PlanningHealthProps {
  weekStart: string;
  storeId?: string;
  shiftsVersion: number; // increment to trigger refresh
}

const SEVERITY_CONFIG = {
  critical: { icon: ShieldAlert, color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  warning: { icon: AlertTriangle, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  info: { icon: Info, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function scoreBorderColor(score: number): string {
  if (score >= 80) return "border-green-500";
  if (score >= 60) return "border-amber-500";
  return "border-red-500";
}

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

export function PlanningHealth({ weekStart, storeId, shiftsVersion }: PlanningHealthProps) {
  const [score, setScore] = useState<PlanningScore | null>(null);
  const [issues, setIssues] = useState<PlanningIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch score
      const scoreRes = await fetch("/api/planning/manager-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "score du planning",
          weekStart,
          storeId: storeId || undefined,
        }),
      });
      const scoreData = await scoreRes.json();
      if (scoreRes.ok && scoreData.proposal?.queryResult?.score) {
        setScore(scoreData.proposal.queryResult.score);
      }

      // Fetch issues
      const analyzeRes = await fetch("/api/planning/manager-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "analyse le planning",
          weekStart,
          storeId: storeId || undefined,
        }),
      });
      const analyzeData = await analyzeRes.json();
      if (analyzeRes.ok && analyzeData.proposal?.queryResult?.issues) {
        setIssues(analyzeData.proposal.queryResult.issues);
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [weekStart, storeId]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth, shiftsVersion]);

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  if (!score && !loading) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
      {/* Compact header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Score circle */}
        <div className="relative shrink-0">
          <div
            className={`w-10 h-10 rounded-full border-[3px] flex items-center justify-center ${
              score ? scoreBorderColor(score.total) : "border-gray-200"
            }`}
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 text-gray-400 animate-spin" />
            ) : score ? (
              <span className={`text-xs font-bold ${scoreColor(score.total)}`}>
                {score.total}
              </span>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              Santé du planning
            </span>
            {score && (
              <span className={`text-xs font-medium ${scoreColor(score.total)}`}>
                {score.label}
              </span>
            )}
          </div>
          {issues.length > 0 && (
            <div className="flex items-center gap-3 mt-0.5">
              {criticalCount > 0 && (
                <span className="text-xs text-red-600 flex items-center gap-0.5">
                  <ShieldAlert className="h-3 w-3" />
                  {criticalCount} critique{criticalCount > 1 ? "s" : ""}
                </span>
              )}
              {warningCount > 0 && (
                <span className="text-xs text-amber-600 flex items-center gap-0.5">
                  <AlertTriangle className="h-3 w-3" />
                  {warningCount} avertissement{warningCount > 1 ? "s" : ""}
                </span>
              )}
              {issues.length === 0 && (
                <span className="text-xs text-green-600 flex items-center gap-0.5">
                  <Check className="h-3 w-3" />
                  Aucun problème
                </span>
              )}
            </div>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            fetchHealth();
          }}
          className="text-gray-400 hover:text-gray-600 p-1 shrink-0"
          title="Rafraîchir"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* Expand */}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {/* Score breakdown */}
          {score && (
            <div className="grid grid-cols-5 gap-3 mb-3">
              {[
                { label: "Couverture", value: score.breakdown.coverage },
                { label: "Heures", value: score.breakdown.hoursBalance },
                { label: "Pauses", value: score.breakdown.breaksRespected },
                { label: "Repos", value: score.breakdown.restRespected },
                { label: "Assignés", value: score.breakdown.unassignedPenalty },
              ].map((dim) => (
                <div key={dim.label} className="text-center">
                  <div className={`text-lg font-bold ${scoreColor(dim.value)}`}>
                    {dim.value}
                  </div>
                  <div className="text-[10px] text-gray-500 leading-tight">{dim.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Issues list */}
          {issues.length > 0 ? (
            <div className="space-y-1.5">
              {issues.map((issue, i) => {
                const config = SEVERITY_CONFIG[issue.severity];
                const Icon = config.icon;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 p-2 rounded-md border ${config.bg} ${config.border} ${config.color}`}
                  >
                    <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0 text-xs">
                      <span>{issue.message}</span>
                      {(issue.date || issue.storeName) && (
                        <span className="opacity-70 ml-1">
                          {issue.date && formatDateFr(issue.date)}
                          {issue.storeName && ` · ${issue.storeName}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-700">
              <Check className="h-4 w-4" />
              Aucun problème détecté
            </div>
          )}
        </div>
      )}
    </div>
  );
}
