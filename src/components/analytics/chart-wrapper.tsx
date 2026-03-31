"use client";

import { ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

interface ChartWrapperProps {
  title: string;
  loading?: boolean;
  empty?: boolean;
  height?: number;
  children: React.ReactNode;
}

export default function ChartWrapper({ title, loading, empty, height = 300, children }: ChartWrapperProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : empty ? (
        <div className="flex items-center justify-center text-sm text-gray-400" style={{ height }}>
          Aucune donnée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      )}
    </div>
  );
}
