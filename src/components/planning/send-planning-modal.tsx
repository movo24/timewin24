"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Mail,
  Loader2,
  Check,
  AlertTriangle,
  Users,
  User,
  ChevronRight,
  ArrowLeft,
  Send,
  RefreshCw,
  History,
} from "lucide-react";
import type { NotifyEmployeeResult, NotifyResponse } from "@/app/api/planning/notify/route";
import type {
  EmployeeNotificationStatus,
  NotificationsListResponse,
  NotificationStatus,
} from "@/app/api/planning/notifications/route";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SendPlanningModalProps {
  open: boolean;
  onClose: () => void;
  /** Monday of the displayed week */
  weekStart: string;
  /** Active store filter (empty = all stores) */
  storeId?: string;
  /**
   * For day-view: restrict the period to a single day.
   * Pass the same string for both to send only that day.
   */
  periodStart?: string;
  periodEnd?: string;
  /** Human-readable label of the current view ("semaine du…" or "lundi 14 avr.") */
  periodLabel?: string;
}

type Step =
  | "mode"         // choose: all employees vs single employee
  | "pick"         // pick one employee (single mode only)
  | "preview"      // dry-run results — confirm before sending
  | "sending"      // API in progress
  | "done";        // show results

type Mode = "all" | "single";

// ─── Component ──────────────────────────────────────────────────────────────

export function SendPlanningModal({
  open,
  onClose,
  weekStart,
  storeId,
  periodStart,
  periodEnd,
  periodLabel,
}: SendPlanningModalProps) {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<Mode>("all");

  // For single-employee mode
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  // Preview data (dry run)
  const [preview, setPreview] = useState<NotifyEmployeeResult[]>([]);
  const [previewLabel, setPreviewLabel] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Send-status data (from GET /api/planning/notifications)
  const [statusByEmployee, setStatusByEmployee] = useState<Map<string, EmployeeNotificationStatus>>(new Map());
  const [statusCounts, setStatusCounts] = useState<Record<NotificationStatus, number>>({
    NOT_SENT: 0, SENT: 0, MODIFIED: 0, FAILED: 0, NO_EMAIL: 0,
  });

  // Filter mode for the bulk send
  const [modifiedOnly, setModifiedOnly] = useState(false);

  // Send results
  const [results, setResults] = useState<NotifyEmployeeResult[]>([]);
  const [sendStats, setSendStats] = useState({ sent: 0, failed: 0, noEmail: 0 });
  const [sendError, setSendError] = useState("");

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setStep("mode");
      setMode("all");
      setSelectedEmployeeId("");
      setPreview([]);
      setPreviewLabel("");
      setPreviewError("");
      setResults([]);
      setSendError("");
      setStatusByEmployee(new Map());
      setStatusCounts({ NOT_SENT: 0, SENT: 0, MODIFIED: 0, FAILED: 0, NO_EMAIL: 0 });
      setModifiedOnly(false);
    }
  }, [open]);

  // ─── API Helpers ───────────────────────────────────────────────────────────

  function buildPayload(dry: boolean, empId?: string, opts: { modifiedOnly?: boolean } = {}) {
    return {
      weekStart,
      storeId: storeId || undefined,
      dryRun: dry,
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
      ...(empId ? { employeeId: empId } : {}),
      ...(opts.modifiedOnly ? { modifiedOnly: true } : {}),
    };
  }

  function buildStatusUrl(empId?: string) {
    const qs = new URLSearchParams();
    qs.set("weekStart", weekStart);
    if (storeId) qs.set("storeId", storeId);
    if (periodStart) qs.set("periodStart", periodStart);
    if (periodEnd) qs.set("periodEnd", periodEnd);
    // Note: GET endpoint scopes by store/period; employeeId filter is applied client-side
    void empId;
    return `/api/planning/notifications?${qs.toString()}`;
  }

  async function fetchPreview(empId?: string) {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      // Run preview + status in parallel — allSettled isolates failures so a
      // status fetch error never blocks the preview (the latter is enrichment).
      const [previewSettled, statusSettled] = await Promise.allSettled([
        fetch("/api/planning/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(true, empId)),
        }).then(async (r) => ({ ok: r.ok, body: await r.json() })),
        fetch(buildStatusUrl(empId)).then(async (r) =>
          r.ok ? ((await r.json()) as NotificationsListResponse) : null
        ),
      ]);

      // 1) Preview is mandatory — surface failure clearly
      if (previewSettled.status === "rejected") {
        setPreviewError("Erreur réseau");
        return;
      }
      const { ok: previewOk, body: raw } = previewSettled.value;
      if (!previewOk) {
        setPreviewError(raw?.error ?? "Erreur lors de la prévisualisation");
        return;
      }
      const data = raw as NotifyResponse;
      if (!data || !Array.isArray(data.results)) {
        setPreviewError("Réponse inattendue du serveur");
        return;
      }

      // 2) Status is best-effort — surface nothing if it fails
      if (statusSettled.status === "fulfilled" && statusSettled.value?.notifications) {
        const statusData = statusSettled.value;
        const map = new Map<string, EmployeeNotificationStatus>();
        for (const s of statusData.notifications) {
          map.set(s.employeeId, s);
        }
        setStatusByEmployee(map);
        setStatusCounts(statusData.counts);
      }

      setPreview(data.results);
      setPreviewLabel(data.periodLabel);
      setStep("preview");
    } catch {
      setPreviewError("Erreur réseau");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSend() {
    setStep("sending");
    setSendError("");
    const empId = mode === "single" ? selectedEmployeeId : undefined;
    try {
      const res = await fetch("/api/planning/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload(false, empId, { modifiedOnly: mode === "all" && modifiedOnly })
        ),
      });
      const raw = await res.json();
      if (!res.ok) {
        setSendError(raw?.error ?? "Erreur lors de l'envoi");
        setStep("preview");
        return;
      }
      const data = raw as NotifyResponse;
      if (!data || !Array.isArray(data.results)) {
        setSendError("Réponse inattendue du serveur");
        setStep("preview");
        return;
      }
      setResults(data.results);
      setSendStats({
        sent: data.sent,
        failed: data.failed,
        noEmail: data.noEmail,
      });
      setStep("done");
    } catch {
      setSendError("Erreur réseau");
      setStep("preview");
    }
  }

  const noEmailCount = preview.filter((r) => !r.email).length;
  const withEmailCount = preview.filter((r) => r.email).length;

  // When "modified only" is on, the send will only target NOT_SENT + MODIFIED + FAILED with email.
  const effectiveSendCount =
    modifiedOnly && mode === "all"
      ? preview.filter((r) => {
          if (!r.email) return false;
          const s = statusByEmployee.get(r.employeeId)?.status;
          return s === "NOT_SENT" || s === "MODIFIED" || s === "FAILED" || !s;
        }).length
      : withEmailCount;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            Envoyer le planning
          </DialogTitle>
          <DialogDescription>
            {previewLabel
              ? `Période : ${previewLabel}`
              : periodLabel
              ? `Période : ${periodLabel}`
              : "Envoi du planning par email aux employés concernés"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step : mode ──────────────────────────────────────────────── */}
        {step === "mode" && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-500">
              Choisissez le type d&apos;envoi :
            </p>

            <button
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left group"
              onClick={() => {
                setMode("all");
                fetchPreview();
              }}
              disabled={previewLoading}
            >
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Tous les employés concernés</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Chaque employé reçoit uniquement son propre planning sur la période affichée
                </p>
              </div>
              {previewLoading && mode === "all" ? (
                <Loader2 className="h-4 w-4 text-gray-400 animate-spin shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              )}
            </button>

            <button
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left group"
              onClick={() => {
                setMode("single");
                setStep("pick");
              }}
              disabled={previewLoading}
            >
              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200 transition-colors">
                <User className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Un seul employé</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sélectionnez un employé — il reçoit uniquement ses propres shifts
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
            </button>

            {previewError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {previewError}
              </p>
            )}
          </div>
        )}

        {/* ── Step : pick (single employee) ─────────────────────────────── */}
        {step === "pick" && (
          <div className="space-y-3 py-2">
            <button
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
              onClick={() => setStep("mode")}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </button>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                ID de l&apos;employé
              </label>
              <EmployeePicker
                storeId={storeId}
                weekStart={weekStart}
                periodStart={periodStart}
                periodEnd={periodEnd}
                value={selectedEmployeeId}
                onChange={setSelectedEmployeeId}
              />
            </div>

            {previewError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {previewError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={() => setStep("mode")}>
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={!selectedEmployeeId || previewLoading}
                onClick={() => fetchPreview(selectedEmployeeId)}
              >
                {previewLoading ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Chargement...</>
                ) : (
                  <>Aperçu <ChevronRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step : preview (confirmation) ─────────────────────────────── */}
        {step === "preview" && (
          <div className="space-y-4 py-2">
            <button
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
              onClick={() => setStep(mode === "single" ? "pick" : "mode")}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </button>

            {/* Status counts (from GET /api/planning/notifications) */}
            {mode === "all" && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <StatusCountCard label="Non envoyé" count={statusCounts.NOT_SENT} color="gray" />
                <StatusCountCard label="Envoyé" count={statusCounts.SENT} color="green" />
                <StatusCountCard label="Modifié" count={statusCounts.MODIFIED} color="orange" />
                <StatusCountCard label="Échec" count={statusCounts.FAILED} color="red" />
                <StatusCountCard label="Sans email" count={statusCounts.NO_EMAIL} color="amber" />
              </div>
            )}

            {/* "Modified only" toggle (bulk mode) */}
            {mode === "all" && statusCounts.MODIFIED > 0 && (
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-orange-200 bg-orange-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modifiedOnly}
                  onChange={(e) => setModifiedOnly(e.target.checked)}
                  className="rounded border-orange-300"
                />
                <RefreshCw className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                <span className="text-xs text-orange-800 flex-1">
                  Renvoyer uniquement les plannings <strong>modifiés</strong> ou <strong>jamais envoyés</strong>
                  <span className="block text-orange-600 mt-0.5">
                    Ignore les {statusCounts.SENT} planning{statusCounts.SENT !== 1 ? "s" : ""} déjà à jour
                  </span>
                </span>
              </label>
            )}

            {/* Email summary */}
            <div className="flex gap-3">
              <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{withEmailCount}</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  email{withEmailCount !== 1 ? "s" : ""} à envoyer
                </p>
              </div>
              {noEmailCount > 0 && (
                <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{noEmailCount}</p>
                  <p className="text-xs text-amber-600 mt-0.5">sans adresse email</p>
                </div>
              )}
              <div className="flex-1 bg-gray-50 border border-gray-100 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-700">{preview.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">employé{preview.length !== 1 ? "s" : ""} concerné{preview.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {preview.length === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <p className="text-sm text-gray-500">
                  Aucun shift trouvé pour cette période.
                </p>
              </div>
            )}

            {/* Employee list with status badges */}
            {preview.length > 0 && (
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {preview.map((r) => {
                  const status = statusByEmployee.get(r.employeeId);
                  return (
                    <div
                      key={r.employeeId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100"
                    >
                      <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                          <span>{r.shiftCount} shift{r.shiftCount !== 1 ? "s" : ""} · {r.totalHours.toFixed(1)}h</span>
                          {r.email && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="truncate">{r.email}</span>
                            </>
                          )}
                          {status?.lastSentAt && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="flex items-center gap-0.5 text-gray-500">
                                <History className="h-3 w-3" />
                                envoyé {formatRelative(status.lastSentAt)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <SendStatusBadge status={status?.status ?? (r.email ? "NOT_SENT" : "NO_EMAIL")} />
                    </div>
                  );
                })}
              </div>
            )}

            {noEmailCount > 0 && (
              <p className="text-xs text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {noEmailCount} employé{noEmailCount !== 1 ? "s" : ""} sans adresse email ne recevra{noEmailCount !== 1 ? "ont" : ""} pas de notification.
              </p>
            )}

            {sendError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {sendError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={onClose}>
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={effectiveSendCount === 0}
                onClick={handleSend}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {modifiedOnly && mode === "all" ? (
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                ) : (
                  <Send className="h-4 w-4 mr-1.5" />
                )}
                {modifiedOnly && mode === "all"
                  ? `Renvoyer à ${effectiveSendCount} modifié${effectiveSendCount !== 1 ? "s" : ""}`
                  : `Envoyer à ${effectiveSendCount} employé${effectiveSendCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step : sending ────────────────────────────────────────────── */}
        {step === "sending" && (
          <div className="py-12 text-center space-y-3">
            <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
              <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
            </div>
            <p className="text-sm font-medium text-gray-700">Envoi en cours…</p>
            <p className="text-xs text-gray-400">
              Chaque employé reçoit son planning individuel
            </p>
          </div>
        )}

        {/* ── Step : done ───────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="space-y-4 py-2">
            {/* Result summary */}
            <div className="flex gap-3">
              {sendStats.sent > 0 && (
                <div className="flex-1 bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{sendStats.sent}</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    envoyé{sendStats.sent !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
              {sendStats.failed > 0 && (
                <div className="flex-1 bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{sendStats.failed}</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    échec{sendStats.failed !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
              {sendStats.noEmail > 0 && (
                <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{sendStats.noEmail}</p>
                  <p className="text-xs text-amber-600 mt-0.5">sans email</p>
                </div>
              )}
            </div>

            {/* Per-employee log */}
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {results.map((r) => (
                <div
                  key={r.employeeId}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                    {r.error && (
                      <p className="text-xs text-red-500 truncate">{r.error}</p>
                    )}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button size="sm" onClick={onClose}>
                <Check className="h-4 w-4 mr-1.5" /> Fermer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── EmployeePicker ────────────────────────────────────────────────────────
// Fetches employees who have at least one shift in the period and renders a dropdown.

interface EmployeePickerProps {
  storeId?: string;
  weekStart: string;
  periodStart?: string;
  periodEnd?: string;
  value: string;
  onChange: (id: string) => void;
}

interface PickerEmployee {
  id: string;
  name: string;
  shiftCount: number;
  email: string | null;
}

function EmployeePicker({
  storeId,
  weekStart,
  periodStart,
  periodEnd,
  value,
  onChange,
}: EmployeePickerProps) {
  const [employees, setEmployees] = useState<PickerEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    // Fetch dry run for all employees → extract list
    fetch("/api/planning/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekStart,
        storeId: storeId || undefined,
        dryRun: true,
        ...(periodStart ? { periodStart } : {}),
        ...(periodEnd ? { periodEnd } : {}),
      }),
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          throw new Error(json?.error || "Erreur de chargement");
        }
        return json as Partial<NotifyResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const results = Array.isArray(data?.results) ? data.results : [];
        const list = results.map((r) => ({
          id: r.employeeId,
          name: r.name,
          shiftCount: r.shiftCount,
          email: r.email,
        }));
        setEmployees(list);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Impossible de charger la liste des employés");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [weekStart, storeId, periodStart, periodEnd]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des employés…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        {error}
      </p>
    );
  }

  if (employees.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-2">
        Aucun employé avec des shifts sur cette période.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
      {employees.map((emp) => (
        <button
          key={emp.id}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
            value === emp.id
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 bg-gray-50 hover:border-gray-300"
          }`}
          onClick={() => onChange(emp.id)}
        >
          <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
            value === emp.id ? "bg-blue-200" : "bg-gray-200"
          }`}>
            <User className={`h-3.5 w-3.5 ${value === emp.id ? "text-blue-700" : "text-gray-500"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{emp.name}</p>
            <p className="text-xs text-gray-400">
              {emp.shiftCount} shift{emp.shiftCount !== 1 ? "s" : ""}
              {emp.email ? ` · ${emp.email}` : " · ⚠ sans email"}
            </p>
          </div>
          {value === emp.id && (
            <Check className="h-4 w-4 text-blue-600 shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Inline icon component (re-declared inside file for clarity) ──────────
function StatusBadge({ status }: { status: NotifyEmployeeResult["status"] }) {
  if (status === "sent")
    return (
      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
        <Check className="h-3 w-3" /> Envoyé
      </span>
    );
  if (status === "failed")
    return (
      <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 shrink-0">
        <AlertTriangle className="h-3 w-3" /> Échec
      </span>
    );
  if (status === "no_email")
    return (
      <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
        <AlertTriangle className="h-3 w-3" /> Sans email
      </span>
    );
  return null;
}

// ─── Send-status badge (from GET /api/planning/notifications) ─────────────
function SendStatusBadge({ status }: { status: NotificationStatus }) {
  switch (status) {
    case "SENT":
      return (
        <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
          <Check className="h-3 w-3" /> Envoyé
        </span>
      );
    case "MODIFIED":
      return (
        <span className="flex items-center gap-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5 shrink-0">
          <RefreshCw className="h-3 w-3" /> Modifié
        </span>
      );
    case "FAILED":
      return (
        <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 shrink-0">
          <AlertTriangle className="h-3 w-3" /> Échec
        </span>
      );
    case "NO_EMAIL":
      return (
        <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
          <AlertTriangle className="h-3 w-3" /> Sans email
        </span>
      );
    case "NOT_SENT":
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
          Non envoyé
        </span>
      );
  }
}

// ─── Compact status count card ────────────────────────────────────────────
const COUNT_CARD_COLORS = {
  gray: "bg-gray-50 border-gray-100 text-gray-700",
  green: "bg-green-50 border-green-100 text-green-700",
  orange: "bg-orange-50 border-orange-100 text-orange-700",
  red: "bg-red-50 border-red-100 text-red-700",
  amber: "bg-amber-50 border-amber-100 text-amber-700",
} as const;

function StatusCountCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: keyof typeof COUNT_CARD_COLORS;
}) {
  return (
    <div className={`rounded-lg border p-2 text-center ${COUNT_CARD_COLORS[color]}`}>
      <p className="text-base font-bold leading-tight">{count}</p>
      <p className="text-[10px] mt-0.5 opacity-80 leading-tight">{label}</p>
    </div>
  );
}

// ─── Relative date formatting ─────────────────────────────────────────────
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `il y a ${diffD}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
