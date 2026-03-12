"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  diff: string | null;
  createdAt: string;
  user: { name: string; email: string };
}

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "success" | "destructive" | "warning" }> = {
  CREATE: { label: "Création", variant: "success" },
  UPDATE: { label: "Modification", variant: "warning" },
  DELETE: { label: "Suppression", variant: "destructive" },
};

const ENTITY_LABELS: Record<string, string> = {
  Store: "Magasin",
  Employee: "Employé",
  Shift: "Shift",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [entityFilter, setEntityFilter] = useState("");

  const loadLogs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "30" });
    if (entityFilter) params.set("entity", entityFilter);

    const res = await fetch(`/api/audit?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
    }
  }, [page, entityFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Journal d&apos;audit</h1>
        <div className="flex gap-2">
          {["", "Shift", "Store", "Employee"].map((entity) => (
            <Button
              key={entity}
              variant={entityFilter === entity ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setEntityFilter(entity);
                setPage(1);
              }}
            >
              {entity ? ENTITY_LABELS[entity] || entity : "Tout"}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Date
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Utilisateur
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Action
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Entité
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Détails
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const actionInfo = ACTION_LABELS[log.action] || {
                  label: log.action,
                  variant: "default" as const,
                };
                let diffPreview = "";
                if (log.diff) {
                  try {
                    const parsed = JSON.parse(log.diff);
                    diffPreview = JSON.stringify(parsed, null, 0).slice(0, 120);
                    if (diffPreview.length >= 120) diffPreview += "...";
                  } catch {
                    diffPreview = log.diff.slice(0, 120);
                  }
                }

                return (
                  <tr
                    key={log.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{log.user.name}</div>
                      <div className="text-xs text-gray-400">
                        {log.user.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={actionInfo.variant}>
                        {actionInfo.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {ENTITY_LABELS[log.entity] || log.entity}
                      <span className="text-xs text-gray-400 ml-1">
                        ({log.entityId.slice(0, 8)})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">
                      {diffPreview || "-"}
                    </td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Aucune entrée d&apos;audit
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
