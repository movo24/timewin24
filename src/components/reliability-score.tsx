"use client";

import { cn } from "@/lib/utils";

type ProfileCategory = "A" | "B" | "C";

interface ScoreBreakdown {
  score: number;
  punctualityScore: number;      // /20
  attendanceScore: number;       // /20
  autonomyScore: number;         // /15
  openCloseQualityScore: number; // /10
  incidentScore: number;         // /10
  replacementScore: number;      // /10
  planningScore: number;         // /10
  transparencyScore: number;     // /5
  profileCategory: ProfileCategory;
  metrics: {
    // Ponctualité
    totalShiftsWithClockIn: number;
    onTimeCount: number;
    lateCount: number;
    latePenalty: number;
    // Présence
    totalAssignedShifts: number;
    noShowCount: number;
    unjustifiedAbsences: number;
    approvedAbsences: number;
    // Autonomie
    skillCount: number;
    hasOpenCloseSkills: boolean;
    openCloseShifts: number;
    // Qualité ouv/ferm
    openCloseShiftsTotal: number;
    openCloseOnTimeCount: number;
    // Incidents
    criticalAlerts: number;
    warningAlerts: number;
    infoAlerts: number;
    // Remplacements
    replacementOffersReceived: number;
    replacementsAccepted: number;
    replacementsDeclined: number;
    // Planning
    exchangesInitiated: number;
    listingsPosted: number;
    // Transparence
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

function getProfileBadgeStyles(profile: ProfileCategory): {
  bg: string;
  border: string;
  text: string;
  label: string;
} {
  switch (profile) {
    case "A":
      return {
        bg: "bg-emerald-50",
        border: "border-emerald-300",
        text: "text-emerald-700",
        label: "Profil A",
      };
    case "B":
      return {
        bg: "bg-yellow-50",
        border: "border-yellow-300",
        text: "text-yellow-700",
        label: "Profil B",
      };
    case "C":
      return {
        bg: "bg-red-50",
        border: "border-red-300",
        text: "text-red-700",
        label: "Profil C",
      };
  }
}

/**
 * Profile badge (A/B/C) for use in tables/cards
 */
export function ProfileBadge({ profile }: { profile: ProfileCategory | null | undefined }) {
  if (!profile) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const styles = getProfileBadgeStyles(profile);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
        styles.bg,
        styles.border,
        styles.text
      )}
    >
      {styles.label}
    </span>
  );
}

/**
 * Compact badge showing score (used in table/card views)
 */
export function ScoreBadge({ score, profile }: { score: number | null; profile?: ProfileCategory | null }) {
  if (score == null) {
    return (
      <span className="text-xs text-gray-400">—</span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
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
      {profile && <ProfileBadge profile={profile} />}
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
  { key: "punctualityScore", label: "Ponctualit\u00e9", max: 20 },
  { key: "attendanceScore", label: "Pr\u00e9sence", max: 20 },
  { key: "autonomyScore", label: "Autonomie", max: 15 },
  { key: "openCloseQualityScore", label: "Qualit\u00e9 ouv/ferm", max: 10 },
  { key: "incidentScore", label: "Incidents", max: 10 },
  { key: "replacementScore", label: "Remplacements", max: 10 },
  { key: "planningScore", label: "Planning", max: 10 },
  { key: "transparencyScore", label: "Transparence", max: 5 },
] as const;

/**
 * Full breakdown panel (used in dialog/detail view)
 */
export function ScoreBreakdownPanel({ breakdown }: { breakdown: ScoreBreakdown }) {
  const m = breakdown.metrics;
  const profileStyles = getProfileBadgeStyles(breakdown.profileCategory);

  return (
    <div className="space-y-4">
      {/* Overall score + profile badge */}
      <div className="flex items-center justify-center gap-4">
        <div className="text-center">
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
        <div
          className={cn(
            "flex flex-col items-center px-3 py-2 rounded-lg border",
            profileStyles.bg,
            profileStyles.border
          )}
        >
          <span className={cn("text-lg font-bold", profileStyles.text)}>
            {breakdown.profileCategory}
          </span>
          <span className={cn("text-xs", profileStyles.text)}>
            {breakdown.profileCategory === "A"
              ? "Fiable"
              : breakdown.profileCategory === "B"
                ? "Correct"
                : "Fragile"}
          </span>
        </div>
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
          D\u00e9tails (30 derniers jours)
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Ponctualité */}
          <MetricItem label="Pointages" value={m.totalShiftsWithClockIn} />
          <MetricItem label="\u00c0 l'heure" value={m.onTimeCount} good />
          <MetricItem label="Retards" value={m.lateCount} bad={m.lateCount > 0} />
          <MetricItem label="No-shows" value={m.noShowCount} bad={m.noShowCount > 0} />
          {/* Présence */}
          <MetricItem label="Abs. injustifi\u00e9es" value={m.unjustifiedAbsences} bad={m.unjustifiedAbsences > 0} />
          <MetricItem label="Abs. approuv\u00e9es" value={m.approvedAbsences} />
          {/* Autonomie */}
          <MetricItem label="Comp\u00e9tences" value={m.skillCount} good={m.skillCount >= 3} />
          <MetricItem label="Ouv/ferm" value={m.openCloseShifts} good={m.openCloseShifts > 0} />
          {/* Qualité ouv/ferm */}
          <MetricItem label="Shifts ouv/ferm" value={m.openCloseShiftsTotal} />
          <MetricItem label="Ponctualit\u00e9 ouv/ferm" value={m.openCloseOnTimeCount} good={m.openCloseOnTimeCount > 0} />
          {/* Incidents */}
          <MetricItem label="Alertes critiques" value={m.criticalAlerts} bad={m.criticalAlerts > 0} />
          <MetricItem label="Alertes warning" value={m.warningAlerts} bad={m.warningAlerts > 0} />
          {/* Remplacements */}
          <MetricItem label="Rempl. accept\u00e9s" value={m.replacementsAccepted} good />
          <MetricItem label="Rempl. refus\u00e9s" value={m.replacementsDeclined} bad={m.replacementsDeclined > 0} />
          {/* Planning */}
          <MetricItem label="\u00c9changes initi\u00e9s" value={m.exchangesInitiated} />
          <MetricItem label="Shifts publi\u00e9s" value={m.listingsPosted} />
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
