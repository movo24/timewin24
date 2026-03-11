"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight,
  Check,
  X,
  Clock,
  User,
  MapPin,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────

interface ShiftInfo {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  store: { id: string; name: string };
  employeeId: string | null;
}

interface EmployeeInfo {
  id: string;
  firstName: string;
  lastName: string;
}

interface ExchangeEntry {
  id: string;
  requesterId: string;
  targetId: string;
  requesterShiftId: string;
  targetShiftId: string | null;
  status: string;
  message: string | null;
  peerResponse: string | null;
  managerResponse: string | null;
  createdAt: string;
  requester: EmployeeInfo | null;
  target: EmployeeInfo | null;
  requesterShift: ShiftInfo | null;
  targetShift: ShiftInfo | null;
}

interface ShiftExchangePanelProps {
  employeeId: string;
  role: "EMPLOYEE" | "ADMIN" | "MANAGER";
}

// ─── Status Labels ──────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING_PEER: { label: "En attente du collègue", color: "bg-amber-100 text-amber-700" },
  PENDING_MANAGER: { label: "En attente du manager", color: "bg-blue-100 text-blue-700" },
  APPROVED: { label: "Approuvé", color: "bg-green-100 text-green-700" },
  REJECTED_PEER: { label: "Refusé par le collègue", color: "bg-red-100 text-red-700" },
  REJECTED_MANAGER: { label: "Refusé par le manager", color: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Annulé", color: "bg-gray-100 text-gray-600" },
  EXPIRED: { label: "Expiré", color: "bg-gray-100 text-gray-500" },
};

// ─── Helpers ────────────────────────────────────

function formatDateFr(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date().getTime();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Il y a quelques minutes";
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

// ─── Component ──────────────────────────────────

export function ShiftExchangePanel({ employeeId, role }: ShiftExchangePanelProps) {
  const [exchanges, setExchanges] = useState<ExchangeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isAdmin = role === "ADMIN" || role === "MANAGER";

  const loadExchanges = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shift-exchanges");
      if (res.ok) {
        const data = await res.json();
        setExchanges(data.exchanges || []);
      }
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExchanges();
  }, [loadExchanges]);

  async function handleAction(exchangeId: string, action: string) {
    setActing(exchangeId);
    try {
      const res = await fetch(`/api/shift-exchanges/${exchangeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        loadExchanges();
      }
    } catch {
      // Silent
    } finally {
      setActing(null);
    }
  }

  // Count pending items that need action from this user
  const pendingForMe = exchanges.filter((ex) => {
    if (ex.status === "PENDING_PEER" && ex.targetId === employeeId) return true;
    if (ex.status === "PENDING_MANAGER" && isAdmin) return true;
    return false;
  });

  const activeExchanges = exchanges.filter((ex) =>
    ["PENDING_PEER", "PENDING_MANAGER"].includes(ex.status)
  );
  const pastExchanges = exchanges.filter((ex) =>
    !["PENDING_PEER", "PENDING_MANAGER"].includes(ex.status)
  );

  if (exchanges.length === 0 && !loading) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ArrowLeftRight className="h-4 w-4 text-violet-500 shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <span className="text-sm font-medium text-gray-700">
            Échanges de shifts
          </span>
          {pendingForMe.length > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {pendingForMe.length} en attente
            </span>
          )}
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
        ) : expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {/* Active exchanges */}
          {activeExchanges.length > 0 && (
            <div className="space-y-2">
              {activeExchanges.map((ex) => (
                <ExchangeCard
                  key={ex.id}
                  exchange={ex}
                  employeeId={employeeId}
                  isAdmin={isAdmin}
                  acting={acting === ex.id}
                  onAction={(action) => handleAction(ex.id, action)}
                />
              ))}
            </div>
          )}

          {activeExchanges.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-2">
              Aucun échange en cours
            </div>
          )}

          {/* Past exchanges (collapsed) */}
          {pastExchanges.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                {pastExchanges.length} échange(s) passé(s)
              </summary>
              <div className="mt-2 space-y-1.5">
                {pastExchanges.slice(0, 10).map((ex) => (
                  <div key={ex.id} className="flex items-center gap-2 text-xs text-gray-500 p-2 bg-gray-50 rounded">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_CONFIG[ex.status]?.color || "bg-gray-100"}`}>
                      {STATUS_CONFIG[ex.status]?.label || ex.status}
                    </span>
                    <span>
                      {ex.requester?.firstName} ↔ {ex.target?.firstName}
                    </span>
                    <span className="ml-auto">{timeAgo(ex.createdAt)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Exchange Card ──────────────────────────────

function ExchangeCard({
  exchange,
  employeeId,
  isAdmin,
  acting,
  onAction,
}: {
  exchange: ExchangeEntry;
  employeeId: string;
  isAdmin: boolean;
  acting: boolean;
  onAction: (action: string) => void;
}) {
  const statusConfig = STATUS_CONFIG[exchange.status] || { label: exchange.status, color: "bg-gray-100" };

  const isRequester = exchange.requesterId === employeeId;
  const isTarget = exchange.targetId === employeeId;
  const needsPeerAction = exchange.status === "PENDING_PEER" && isTarget;
  const needsManagerAction = exchange.status === "PENDING_MANAGER" && isAdmin;

  return (
    <div className={`rounded-lg border p-3 ${needsPeerAction || needsManagerAction ? "border-violet-300 bg-violet-50/50" : "border-gray-200"}`}>
      {/* Status badge */}
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
        <span className="text-xs text-gray-400">{timeAgo(exchange.createdAt)}</span>
      </div>

      {/* Exchange details */}
      <div className="flex items-center gap-3">
        {/* Requester shift */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <User className="h-3 w-3" />
            {exchange.requester?.firstName} {exchange.requester?.lastName}
            {isRequester && <span className="text-violet-600">(vous)</span>}
          </div>
          {exchange.requesterShift && (
            <div className="text-xs mt-0.5">
              <span className="flex items-center gap-1 text-gray-600">
                <Clock className="h-3 w-3" />
                {formatDateFr(exchange.requesterShift.date)} {exchange.requesterShift.startTime}–{exchange.requesterShift.endTime}
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <MapPin className="h-3 w-3" />
                {exchange.requesterShift.store.name}
              </span>
            </div>
          )}
        </div>

        {/* Arrow */}
        <ArrowLeftRight className="h-4 w-4 text-gray-400 shrink-0" />

        {/* Target */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <User className="h-3 w-3" />
            {exchange.target?.firstName} {exchange.target?.lastName}
            {isTarget && <span className="text-violet-600">(vous)</span>}
          </div>
          {exchange.targetShift ? (
            <div className="text-xs mt-0.5">
              <span className="flex items-center gap-1 text-gray-600">
                <Clock className="h-3 w-3" />
                {formatDateFr(exchange.targetShift.date)} {exchange.targetShift.startTime}–{exchange.targetShift.endTime}
              </span>
              <span className="flex items-center gap-1 text-gray-500">
                <MapPin className="h-3 w-3" />
                {exchange.targetShift.store.name}
              </span>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mt-0.5">Prend le shift</div>
          )}
        </div>
      </div>

      {/* Message */}
      {exchange.message && (
        <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2 italic">
          "{exchange.message}"
        </div>
      )}

      {/* Manager response */}
      {exchange.managerResponse && (
        <div className="mt-1 text-xs text-blue-600 bg-blue-50 rounded p-2 flex items-start gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          Manager : "{exchange.managerResponse}"
        </div>
      )}

      {/* Action buttons */}
      {(needsPeerAction || needsManagerAction || (isRequester && exchange.status === "PENDING_PEER")) && (
        <div className="mt-2 flex gap-2">
          {needsPeerAction && (
            <>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                onClick={() => onAction("peer_accept")}
                disabled={acting}
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Accepter
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700"
                onClick={() => onAction("peer_reject")}
                disabled={acting}
              >
                <X className="h-3 w-3 mr-1" />
                Refuser
              </Button>
            </>
          )}
          {needsManagerAction && (
            <>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                onClick={() => onAction("manager_approve")}
                disabled={acting}
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Valider
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700"
                onClick={() => onAction("manager_reject")}
                disabled={acting}
              >
                <X className="h-3 w-3 mr-1" />
                Refuser
              </Button>
            </>
          )}
          {isRequester && exchange.status === "PENDING_PEER" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onAction("cancel")}
              disabled={acting}
            >
              Annuler
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
