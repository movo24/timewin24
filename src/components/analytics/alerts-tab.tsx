"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, AlertOctagon, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AlertsTabProps {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}

interface PerformanceAlert {
  id: string;
  type: string;
  severity: "critical" | "warning";
  employeeName: string;
  storeName: string;
  message: string;
  value: number;
  threshold: number;
  createdAt: string;
}

export default function AlertsTab({ dateFrom, dateTo, storeId }: AlertsTabProps) {
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning">("all");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (storeId) params.set("storeId", storeId);
        const res = await fetch(`/api/analytics/alerts?${params}`);
        if (!res.ok) throw new Error("Erreur lors du chargement");
        const json = await res.json();
        setAlerts(json.alerts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [dateFrom, dateTo, storeId]);

  const filtered = severityFilter === "all"
    ? alerts
    : alerts.filter((a) => a.severity === severityFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-gray-500">Filtre :</span>
        {(["all", "critical", "warning"] as const).map((sev) => (
          <Button
            key={sev}
            variant={severityFilter === sev ? "default" : "outline"}
            size="sm"
            onClick={() => setSeverityFilter(sev)}
          >
            {sev === "all" ? "Toutes" : sev === "critical" ? "Critiques" : "Avertissements"}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <AlertTriangle className="h-10 w-10 mb-3" />
          <p className="text-sm">Aucune alerte détectée</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "bg-white rounded-xl border p-4 shadow-sm",
                alert.severity === "critical"
                  ? "border-red-200"
                  : "border-yellow-200"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "p-2 rounded-lg shrink-0",
                    alert.severity === "critical"
                      ? "bg-red-50"
                      : "bg-yellow-50"
                  )}
                >
                  {alert.severity === "critical" ? (
                    <AlertOctagon className="h-5 w-5 text-red-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border",
                        alert.severity === "critical"
                          ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-yellow-100 text-yellow-700 border-yellow-200"
                      )}
                    >
                      {alert.severity === "critical" ? "Critique" : "Avertissement"}
                    </span>
                    <span className="text-xs text-gray-400">{alert.type}</span>
                  </div>

                  <p className="text-sm font-medium text-gray-900 mb-1">{alert.message}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>
                      <span className="font-medium text-gray-700">{alert.employeeName}</span>
                      {" \u2014 "}
                      {alert.storeName}
                    </span>
                    <span>
                      Valeur : <span className="font-medium text-gray-700">{alert.value}</span>
                      {" / Seuil : "}
                      <span className="font-medium text-gray-700">{alert.threshold}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
