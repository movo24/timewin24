"use client";

import { cn } from "@/lib/utils";

export type PerformanceLevel = "EXCELLENT" | "BON" | "MOYEN" | "FAIBLE";

const badgeStyles: Record<PerformanceLevel, string> = {
  EXCELLENT: "bg-emerald-100 text-emerald-700 border-emerald-200",
  BON: "bg-blue-100 text-blue-700 border-blue-200",
  MOYEN: "bg-yellow-100 text-yellow-700 border-yellow-200",
  FAIBLE: "bg-red-100 text-red-700 border-red-200",
};

const badgeLabels: Record<PerformanceLevel, string> = {
  EXCELLENT: "Excellent",
  BON: "Bon",
  MOYEN: "Moyen",
  FAIBLE: "Faible",
};

export function getPerformanceLevel(score: number): PerformanceLevel {
  if (score >= 80) return "EXCELLENT";
  if (score >= 60) return "BON";
  if (score >= 40) return "MOYEN";
  return "FAIBLE";
}

export function ScoreBadge({ level }: { level: PerformanceLevel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
        badgeStyles[level]
      )}
    >
      {badgeLabels[level]}
    </span>
  );
}

export function ScoreValue({ score }: { score: number }) {
  const level = getPerformanceLevel(score);
  const colorMap: Record<PerformanceLevel, string> = {
    EXCELLENT: "text-emerald-700",
    BON: "text-blue-700",
    MOYEN: "text-yellow-700",
    FAIBLE: "text-red-700",
  };

  return (
    <span className={cn("font-bold", colorMap[level])}>
      {score.toFixed(0)}
    </span>
  );
}
