"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  subtitle?: string;
  trend?: number;
  color?: "blue" | "emerald" | "amber" | "purple" | "rose";
}

const colorMap = {
  blue: { bg: "bg-blue-50", text: "text-blue-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  purple: { bg: "bg-purple-50", text: "text-purple-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
};

export default function KpiCard({ icon: Icon, label, value, subtitle, trend, color = "blue" }: KpiCardProps) {
  const colors = colorMap[color];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn("p-2 rounded-lg", colors.bg)}>
          <Icon className={cn("h-5 w-5", colors.text)} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      {trend !== undefined && (
        <p className={cn("text-xs mt-1", trend >= 0 ? "text-green-600" : "text-red-500")}>
          {trend >= 0 ? "\u2191" : "\u2193"} {Math.abs(trend).toFixed(1)}%
        </p>
      )}
    </div>
  );
}
