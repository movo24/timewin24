"use client";

import { cn } from "@/lib/utils";

interface ScoreBreakdown {
  score: number;
  punctualityScore: number;
  attendanceScore: number;
  replacementScore: number;
  planningScore: number;
  transparencyScore: number;
  metrics: {
    totalShiftsWithClockIn: number;
    onTimeCount: number;
    lateCount: number;
    latePenalty: number;
    totalAssignedShifts: number;
    noShowCount: number;
    unjustifiedAbsences: number;
    approvedAbsences: number;
    replacementOffersReceived: number;
    replacementsAccepted: number;
    replacementsDeclined: number;
    exchangesInitiated: number;
    listingsPosted: number;
    totalAbsences: number;
    declaredAbsences: number;
  };
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function getBarColor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return "bg-emerald-500";
  if (pct >= 0.6) return "bg-yellow-500";
  if (pct >= 0.4) return "bg-orange-500";
  return "bg-red-500";
}

function getBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-50";
  if (score >= 60) return "bg-yellow-50";
  if (score >= 40) return "bg-orange-50";
  return "bg-red-50";
}

function getBorderColor(score: number): string {
  if (score >= 80) return "border-emerald-200";
  if (score >= 60) return "border-yellow-200";
  if (score >= 40) return "border-orange-200";
  return "border-red-200";
}

/**
 * Compact badge showing score (used in table/card views)
 */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="text-xs text-gray-400">—</span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border",
        getBgColor(score),
        getBorderColor(score),
        getScoreColor(score)
      )}
    >
      {score}
    </span>
  );
}

/**
 * Small horizontal bar indicator for inline use
 */
export function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", getBarColor(score, 100))}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("text-xs font-bold", getScoreColor(score))}>
        {score}
      </span>
    </div>
  );
}

const CATEGORIES = [
  { key: "punctualityScore", label: "Ponctualité", max: 30 },
  { key: "attendanceScore", label: "Présence", max: 30 },
  { key: "replacementScore", label: "Remplacements", max: 20 },
  { key: "planningScore", label: "Planning", max: 15 },
  { key: "transparencyScore", label: "Transparence", max: 5 },
] as const;

/**
 * Full breakdown panel (used in dialog/detail view)
 */
export function ScoreBreakdownPanel({ breakdown }: { breakdown: ScoreBreakdown }) {
  const m = breakdown.metrics;

  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="flex items-center justify-center gap-3">
        <div
          className={cn(
            "text-4xl font-bold",
            getScoreColor(breakdown.score)
          )}
        >
          {breakdown.score}
        </div>
        <div className="text-sm text-gray-500">/ 100</div>
      </div>

      {/* Category bars */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const value = breakdown[cat.key];
          const pct = cat.max > 0 ? (value / cat.max) * 100 : 0;

          return (
            <div key={cat.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">
                  {cat.label}
                </span>
                <span className="text-xs text-gray-500">
                  {value}/{cat.max}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    getBarColor(value, cat.max)
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed metrics */}
      <div className="border-t border-gray-200 pt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Détails (30 derniers jours)
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <MetricItem label="Pointages" value={m.totalShiftsWithClockIn} />
          <MetricItem label="À l'heure" value={m.onTimeCount} good />
          <MetricItem label="Retards" value={m.lateCount} bad={m.lateCount > 0} />
          <MetricItem label="No-shows" value={m.noShowCount} bad={m.noShowCount > 0} />
          <MetricItem label="Absences injustifiées" value={m.unjustifiedAbsences} bad={m.unjustifiedAbsences > 0} />
          <MetricItem label="Absences approuvées" value={m.approvedAbsences} />
          <MetricItem label="Rempl. acceptés" value={m.replacementsAccepted} good />
          <MetricItem label="Rempl. refusés" value={m.replacementsDeclined} bad={m.replacementsDeclined > 0} />
          <MetricItem label="Échanges initiés" value={m.exchangesInitiated} />
          <MetricItem label="Shifts publiés" value={m.listingsPosted} />
        </div>
      </div>
    </div>
  );
}

function MetricItem({
  label,
  value,
  good,
  bad,
}: {
  label: string;
  value: number;
  good?: boolean;
  bad?: boolean;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5">
      <span className="text-gray-600">{label}</span>
      <span
        className={cn(
          "font-semibold",
          good ? "text-emerald-600" : bad ? "text-red-600" : "text-gray-800"
        )}
      >
        {value}
      </span>
    </div>
  );
}
