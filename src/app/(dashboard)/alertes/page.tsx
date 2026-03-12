"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Users,
  Store,
  Eye,
} from "lucide-react";

/* ---------- types ---------- */

interface ManagerAlert {
  id: string;
  type: string;
  severity: string;
  status: string;
  storeId: string;
  date: string;
  time: string | null;
  title: string;
  details: string | null;
  contextKey: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  store: { id: string; name: string };
}

interface StoreOption {
  id: string;
  name: string;
}

/* ---------- config ---------- */

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Bell }
> = {
  STORE_NOT_OPENED: { label: "Magasin non ouvert", icon: Store },
  ABSENCE_NOT_REPLACED: { label: "Absence non remplacée", icon: Users },
  SIGNIFICANT_LATENESS: { label: "Retard significatif", icon: Clock },
  INCOMPLETE_TEAM: { label: "Équipe incomplète", icon: AlertTriangle },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  UNREAD: { label: "Non lue", className: "bg-red-100 text-red-700 hover:bg-red-100" },
  ACKNOWLEDGED: { label: "Acquittée", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  RESOLVED: { label: "Résolue", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  DISMISSED: { label: "Écartée", className: "bg-gray-100 text-gray-600 hover:bg-gray-100" },
};

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  INFO: { label: "Info", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  WARNING: { label: "Attention", className: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
  CRITICAL: { label: "Critique", className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

/* ---------- page ---------- */

export default function AlertesPage() {
  const [alerts, setAlerts] = useState<ManagerAlert[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("UNREAD");
  const [storeFilter, setStoreFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(
    new Date().toISOString().split("T")[0]
  );

  const loadStores = useCallback(async () => {
    const res = await fetch("/api/stores?limit=100");
    if (res.ok) {
      const data = await res.json();
      setStores(
        (data.stores || []).map((s: { id: string; name: string }) => ({
          id: s.id,
          name: s.name,
        }))
      );
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (storeFilter !== "all") params.set("storeId", storeFilter);
    if (dateFilter) params.set("date", dateFilter);

    const res = await fetch(`/api/alerts?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setAlerts(data.alerts || []);
    }
    setLoading(false);
  }, [typeFilter, statusFilter, storeFilter, dateFilter]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Fire-and-forget: generate alerts on page load
  useEffect(() => {
    fetch("/api/alerts/generate", { method: "POST" }).catch(() => {});
  }, []);

  const handleUpdateStatus = async (alertId: string, newStatus: string) => {
    const res = await fetch(`/api/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) loadAlerts();
  };

  const unreadCount = alerts.filter((a) => a.status === "UNREAD").length;
  const criticalCount = alerts.filter(
    (a) => a.severity === "CRITICAL" && a.status === "UNREAD"
  ).length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Alertes
          </h1>
          {statusFilter === "ALL" && unreadCount > 0 && (
            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </Badge>
          )}
          {criticalCount > 0 && (
            <Badge className="bg-red-500 text-white hover:bg-red-500">
              {criticalCount} critique{criticalCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "ALL", label: "Tous les types" },
            { value: "STORE_NOT_OPENED", label: "Magasin non ouvert" },
            { value: "ABSENCE_NOT_REPLACED", label: "Absence non remplacée" },
            { value: "SIGNIFICANT_LATENESS", label: "Retard significatif" },
            { value: "INCOMPLETE_TEAM", label: "Équipe incomplète" },
          ]}
          className="w-full sm:w-52"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "UNREAD", label: "Non lues" },
            { value: "ACKNOWLEDGED", label: "Acquittées" },
            { value: "RESOLVED", label: "Résolues" },
            { value: "DISMISSED", label: "Écartées" },
            { value: "ALL", label: "Tous les statuts" },
          ]}
          className="w-full sm:w-44"
        />
        <Select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          options={[
            { value: "all", label: "Tous les magasins" },
            ...stores.map((s) => ({ value: s.id, label: s.name })),
          ]}
          className="w-full sm:w-52"
        />
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-full sm:w-44"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
          Aucune alerte pour ces critères
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {alerts.map((alert) => {
              const typeConf = TYPE_CONFIG[alert.type];
              const sevConf = SEVERITY_CONFIG[alert.severity];
              const statConf = STATUS_CONFIG[alert.status];
              const TypeIcon = typeConf?.icon || Bell;

              return (
                <div
                  key={alert.id}
                  className={`bg-white border rounded-lg p-3 ${
                    alert.status === "UNREAD" && alert.severity === "CRITICAL"
                      ? "border-red-300 bg-red-50/30"
                      : alert.status === "UNREAD"
                      ? "border-orange-200 bg-orange-50/20"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      <TypeIcon className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {sevConf && (
                          <Badge className={sevConf.className}>
                            {sevConf.label}
                          </Badge>
                        )}
                        {statConf && (
                          <Badge className={statConf.className}>
                            {statConf.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        {alert.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{alert.store.name}</span>
                        {alert.time && <span>{alert.time}</span>}
                      </div>
                      {alert.status === "UNREAD" && (
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleUpdateStatus(alert.id, "ACKNOWLEDGED")
                            }
                            className="gap-1 text-xs"
                          >
                            <Eye className="h-3 w-3" />
                            Acquitter
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleUpdateStatus(alert.id, "RESOLVED")
                            }
                            className="gap-1 text-xs"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Résoudre
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleUpdateStatus(alert.id, "DISMISSED")
                            }
                            className="gap-1 text-xs text-gray-500"
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Magasin
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Heure
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Titre
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">
                    Sévérité
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">
                    Statut
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => {
                  const typeConf = TYPE_CONFIG[alert.type];
                  const sevConf = SEVERITY_CONFIG[alert.severity];
                  const statConf = STATUS_CONFIG[alert.status];
                  const TypeIcon = typeConf?.icon || Bell;

                  return (
                    <tr
                      key={alert.id}
                      className={`border-b border-gray-100 ${
                        alert.status === "UNREAD" &&
                        alert.severity === "CRITICAL"
                          ? "bg-red-50/30"
                          : alert.status === "UNREAD"
                          ? "bg-orange-50/20"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TypeIcon className="h-4 w-4 text-gray-500" />
                          <span className="text-xs text-gray-600">
                            {typeConf?.label || alert.type}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {alert.store.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {alert.time || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {alert.title}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sevConf && (
                          <Badge className={sevConf.className}>
                            {sevConf.label}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {statConf && (
                          <Badge className={statConf.className}>
                            {statConf.label}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {alert.status === "UNREAD" && (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUpdateStatus(alert.id, "ACKNOWLEDGED")
                              }
                              title="Acquitter"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUpdateStatus(alert.id, "RESOLVED")
                              }
                              title="Résoudre"
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUpdateStatus(alert.id, "DISMISSED")
                              }
                              title="Écarter"
                            >
                              <XCircle className="h-4 w-4 text-gray-400" />
                            </Button>
                          </div>
                        )}
                        {alert.status !== "UNREAD" && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
