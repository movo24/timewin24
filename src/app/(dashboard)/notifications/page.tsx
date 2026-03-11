"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Mail,
  Smartphone,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Filter,
} from "lucide-react";

interface NotifLog {
  id: string;
  userId: string;
  eventType: string;
  channel: string;
  priority: string;
  status: string;
  title: string;
  body: string;
  url: string | null;
  error: string | null;
  sentAt: string | null;
  clickedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

const EVENT_LABELS: Record<string, string> = {
  PLANNING_PUBLISHED: "Planning publié",
  PLANNING_MODIFIED: "Planning modifié",
  NEW_MESSAGE: "Nouveau message",
  ABSENCE_REPORTED: "Absence signalée",
  SHIFT_AVAILABLE: "Shift disponible",
  REPLACEMENT_NEEDED: "Remplacement",
  STORE_NOT_OPENED: "Magasin non ouvert",
  MANAGER_ALERT: "Alerte manager",
  BROADCAST: "Annonce",
};

const CHANNEL_ICON: Record<string, typeof Bell> = {
  PUSH: Bell,
  EMAIL: Mail,
  SMS: Smartphone,
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "bg-yellow-100 text-yellow-700" },
  SENT: { label: "Envoyé", cls: "bg-green-100 text-green-700" },
  FAILED: { label: "Échoué", cls: "bg-red-100 text-red-700" },
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  LOW: { label: "Faible", cls: "bg-gray-100 text-gray-600" },
  NORMAL: { label: "Normale", cls: "bg-blue-100 text-blue-700" },
  IMPORTANT: { label: "Importante", cls: "bg-orange-100 text-orange-700" },
  CRITICAL: { label: "Critique", cls: "bg-red-100 text-red-700" },
};

export default function NotificationsPage() {
  const [logs, setLogs] = useState<NotifLog[]>([]);
  const [stats, setStats] = useState({ sent: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("ALL");
  const [filterChannel, setFilterChannel] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== "ALL") params.set("eventType", filterType);
      if (filterChannel !== "ALL") params.set("channel", filterChannel);
      if (filterStatus !== "ALL") params.set("status", filterStatus);
      params.set("limit", "100");

      const res = await fetch(`/api/notifications/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setStats(data.stats || { sent: 0, failed: 0, pending: 0 });
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, [filterType, filterChannel, filterStatus]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <div className="flex gap-2">
          <span className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            {stats.sent} envoyées
          </span>
          {stats.failed > 0 && (
            <span className="px-2.5 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              {stats.failed} échouées
            </span>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <Send className="h-5 w-5 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{stats.sent}</p>
          <p className="text-xs text-gray-500">Envoyées</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{stats.failed}</p>
          <p className="text-xs text-gray-500">Échouées</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
          <Clock className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
          <p className="text-xs text-gray-500">En attente</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
        >
          <option value="ALL">Tous les types</option>
          {Object.entries(EVENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
        >
          <option value="ALL">Tous les canaux</option>
          <option value="PUSH">Push</option>
          <option value="EMAIL">Email</option>
          <option value="SMS">SMS</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="SENT">Envoyé</option>
          <option value="FAILED">Échoué</option>
          <option value="PENDING">En attente</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Chargement...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune notification envoyée</p>
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="space-y-2 lg:hidden">
            {logs.map((log) => {
              const ChannelIcon = CHANNEL_ICON[log.channel] || Bell;
              const statusCfg = STATUS_CONFIG[log.status];
              const priorityCfg = PRIORITY_CONFIG[log.priority];

              return (
                <div
                  key={log.id}
                  className="bg-white rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-start gap-2">
                    <ChannelIcon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {priorityCfg && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${priorityCfg.cls}`}
                          >
                            {priorityCfg.label}
                          </span>
                        )}
                        {statusCfg && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusCfg.cls}`}
                          >
                            {statusCfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {log.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {log.body}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>{log.user.name}</span>
                        <span>{formatDate(log.createdAt)}</span>
                        {log.clickedAt && (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                      {log.error && (
                        <p className="text-xs text-red-500 mt-1">
                          {log.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left font-medium">Canal</th>
                  <th className="px-4 py-2 text-left font-medium">
                    Destinataire
                  </th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Titre</th>
                  <th className="px-4 py-2 text-center font-medium">
                    Priorité
                  </th>
                  <th className="px-4 py-2 text-center font-medium">Statut</th>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const ChannelIcon = CHANNEL_ICON[log.channel] || Bell;
                  const statusCfg = STATUS_CONFIG[log.status];
                  const priorityCfg = PRIORITY_CONFIG[log.priority];

                  return (
                    <tr
                      key={log.id}
                      className={
                        log.status === "FAILED" ? "bg-red-50/30" : ""
                      }
                    >
                      <td className="px-4 py-2.5">
                        <ChannelIcon className="h-4 w-4 text-gray-500" />
                      </td>
                      <td className="px-4 py-2.5 text-gray-900">
                        {log.user.name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {EVENT_LABELS[log.eventType] || log.eventType}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900 max-w-[200px] truncate">
                        {log.title}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {priorityCfg && (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityCfg.cls}`}
                          >
                            {priorityCfg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {statusCfg && (
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCfg.cls}`}
                            >
                              {statusCfg.label}
                            </span>
                          )}
                          {log.clickedAt && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {formatDate(log.createdAt)}
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
