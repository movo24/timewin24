"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  UserMinus,
  RefreshCw,
  FileText,
  Plus,
  Trash2,
  Copy,
  Check,
} from "lucide-react";

/* ---------- types ---------- */

interface TimelineEvent {
  time: string;
  type: string;
  title: string;
  severity: string;
}

interface JournalEntry {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  createdAt: string;
}

interface JournalSummary {
  totalShifts: number;
  onTime: number;
  late: number;
  noShow: number;
  absences: number;
  openReplacements: number;
  filledReplacements: number;
  hrMessages: number;
  incidents: number;
}

interface StoreInfo {
  id: string;
  name: string;
  openTime: string | null;
  closeTime: string | null;
  closed: boolean;
}

interface StoreOption {
  id: string;
  name: string;
}

/* ---------- helpers ---------- */

const SEVERITY_ICON: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Clock,
};

const SEVERITY_COLORS: Record<string, string> = {
  success: "bg-green-50 border-green-200 text-green-700",
  warning: "bg-orange-50 border-orange-200 text-orange-700",
  error: "bg-red-50 border-red-200 text-red-700",
  info: "bg-blue-50 border-blue-200 text-blue-700",
  high: "bg-orange-50 border-orange-200 text-orange-700",
  critical: "bg-red-50 border-red-200 text-red-700",
};

const ENTRY_SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-blue-100 text-blue-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

/* ---------- page ---------- */

export default function JournalPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(false);

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [summary, setSummary] = useState<JournalSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  // Add entry form
  const [showAddForm, setShowAddForm] = useState(false);
  const [entryTitle, setEntryTitle] = useState("");
  const [entryDesc, setEntryDesc] = useState("");
  const [entryType, setEntryType] = useState("NOTE");
  const [entrySeverity, setEntrySeverity] = useState("LOW");
  const [submitting, setSubmitting] = useState(false);

  // Report dialog
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch("/api/stores?limit=100");
      if (res.ok) {
        const data = await res.json();
        const list = data.stores.map((s: { id: string; name: string }) => ({
          id: s.id,
          name: s.name,
        }));
        setStores(list);
        setStoreId((prev) => prev || list[0]?.id || "");
      }
    } catch {
      console.error("Erreur chargement magasins");
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);

    const res = await fetch(
      `/api/journal/daily?date=${date}&storeId=${storeId}`
    );
    if (res.ok) {
      const data = await res.json();
      setStoreInfo(data.store || null);
      setSummary(data.summary || null);
      setTimeline(data.timeline || []);
      setEntries(data.entries || []);
    }
    setLoading(false);
  }, [date, storeId]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (storeId) loadData();
  }, [loadData, storeId]);

  // Fire-and-forget background cleanup
  useEffect(() => {
    fetch("/api/replacements/expired", { method: "POST" }).catch(() => {});
    fetch("/api/market-listings/expired", { method: "POST" }).catch(() => {});
    fetch("/api/alerts/generate", { method: "POST" }).catch(() => {});
  }, []);

  const handleAddEntry = async () => {
    if (!entryTitle.trim() || !storeId) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/journal/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          date,
          type: entryType,
          severity: entrySeverity,
          title: entryTitle.trim(),
          description: entryDesc.trim() || null,
        }),
      });

      if (res.ok) {
        setEntryTitle("");
        setEntryDesc("");
        setShowAddForm(false);
        loadData();
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("Supprimer cette entrée ?")) return;
    try {
      const res = await fetch(`/api/journal/daily/${id}`, { method: "DELETE" });
      if (res.ok) loadData();
    } catch {
      alert("Erreur réseau");
    }
  };

  const handleGenerateReport = async () => {
    if (!storeId) return;
    setReportLoading(true);
    setReportOpen(true);

    const res = await fetch(
      `/api/journal/daily/report?date=${date}&storeId=${storeId}`
    );
    if (res.ok) {
      const data = await res.json();
      setReportText(data.report || "Aucune donnée");
    } else {
      setReportText("Erreur lors de la génération du rapport");
    }
    setReportLoading(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Journal du jour
        </h1>
        <Button
          onClick={handleGenerateReport}
          disabled={!storeId}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Générer rapport
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full sm:w-48"
        />
        <Select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          options={stores.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Sélectionner un magasin"
          className="w-full sm:w-56"
        />
      </div>

      {/* Store info */}
      {storeInfo && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 mb-4 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{storeInfo.name}</span>
          {storeInfo.closed ? (
            <span className="ml-2 text-red-600 font-medium">Fermé</span>
          ) : (
            storeInfo.openTime &&
            storeInfo.closeTime && (
              <span className="ml-2">
                {storeInfo.openTime} - {storeInfo.closeTime}
              </span>
            )
          )}
        </div>
      )}

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard
            value={summary.onTime}
            label="À l'heure"
            color="green"
            icon={CheckCircle2}
          />
          <StatCard
            value={summary.late}
            label="Retards"
            color="orange"
            icon={AlertTriangle}
          />
          <StatCard
            value={summary.noShow}
            label="No-shows"
            color="red"
            icon={XCircle}
          />
          <StatCard
            value={summary.openReplacements}
            label="Rempl. ouverts"
            color="yellow"
            icon={RefreshCw}
          />
          <StatCard
            value={summary.incidents}
            label="Incidents"
            color="purple"
            icon={UserMinus}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Timeline */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Chronologie
            </h2>

            {timeline.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
                Aucun événement pour cette date
              </div>
            ) : (
              <div className="space-y-0">
                {/* Mobile timeline */}
                <div className="space-y-2 lg:hidden">
                  {timeline.map((evt, i) => {
                    const Icon = SEVERITY_ICON[evt.severity] || Clock;
                    const colors =
                      SEVERITY_COLORS[evt.severity] ||
                      "bg-gray-50 border-gray-200 text-gray-700";

                    return (
                      <div
                        key={i}
                        className={`border rounded-lg p-3 ${colors}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 mt-0.5">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold">
                                {evt.time}
                              </span>
                              <span className="text-sm">{evt.title}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop timeline */}
                <div className="hidden lg:block relative">
                  <div className="absolute left-[72px] top-0 bottom-0 w-px bg-gray-200" />
                  <div className="space-y-1">
                    {timeline.map((evt, i) => {
                      const Icon = SEVERITY_ICON[evt.severity] || Clock;
                      const dotColor =
                        evt.severity === "success"
                          ? "bg-green-500"
                          : evt.severity === "warning"
                          ? "bg-orange-500"
                          : evt.severity === "error"
                          ? "bg-red-500"
                          : "bg-blue-500";

                      return (
                        <div key={i} className="flex items-center gap-4 py-1.5">
                          <span className="w-14 text-right text-xs font-mono text-gray-500 shrink-0">
                            {evt.time}
                          </span>
                          <div
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor} ring-2 ring-white`}
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                            <span className="text-sm text-gray-800">
                              {evt.title}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes & Incidents */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Notes & Incidents
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </Button>
            </div>

            {/* Add entry form */}
            {showAddForm && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Select
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value)}
                    options={[
                      { value: "NOTE", label: "Note" },
                      { value: "INCIDENT", label: "Incident" },
                      { value: "OBSERVATION", label: "Observation" },
                    ]}
                    className="w-full sm:w-40"
                  />
                  <Select
                    value={entrySeverity}
                    onChange={(e) => setEntrySeverity(e.target.value)}
                    options={[
                      { value: "LOW", label: "Basse" },
                      { value: "MEDIUM", label: "Moyenne" },
                      { value: "HIGH", label: "Haute" },
                      { value: "CRITICAL", label: "Critique" },
                    ]}
                    className="w-full sm:w-36"
                  />
                </div>
                <Input
                  placeholder="Titre"
                  value={entryTitle}
                  onChange={(e) => setEntryTitle(e.target.value)}
                />
                <textarea
                  placeholder="Description (optionnel)"
                  value={entryDesc}
                  onChange={(e) => setEntryDesc(e.target.value)}
                  className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 min-h-[60px]"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleAddEntry}
                    disabled={!entryTitle.trim() || submitting}
                    size="sm"
                  >
                    {submitting ? "Ajout..." : "Enregistrer"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            {entries.length === 0 && !showAddForm ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500 text-sm">
                Aucune note ou incident
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-white border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            className={
                              ENTRY_SEVERITY_COLORS[entry.severity] || ""
                            }
                          >
                            {entry.severity}
                          </Badge>
                          <Badge variant="secondary">
                            {entry.type === "INCIDENT"
                              ? "Incident"
                              : entry.type === "NOTE"
                              ? "Note"
                              : "Observation"}
                          </Badge>
                          <span className="text-xs text-gray-400 font-mono">
                            {new Date(entry.createdAt)
                              .toISOString()
                              .slice(11, 16)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {entry.title}
                        </p>
                        {entry.description && (
                          <p className="text-xs text-gray-500 mt-1">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Rapport journalier</DialogTitle>
            <DialogDescription>
              Rapport automatique de la journée
            </DialogDescription>
          </DialogHeader>
          {reportLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[50vh]">
                {reportText}
              </pre>
              <div className="flex justify-end mt-3">
                <Button onClick={handleCopy} variant="outline" className="gap-2">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copié !
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copier
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- sub-components ---------- */

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; label: string }> = {
  green: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", label: "text-green-600" },
  orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", label: "text-orange-600" },
  red: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", label: "text-red-600" },
  yellow: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", label: "text-yellow-600" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", label: "text-purple-600" },
};

function StatCard({
  value,
  label,
  color,
  icon: Icon,
}: {
  value: number;
  label: string;
  color: string;
  icon: typeof CheckCircle2;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.green;

  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-3 text-center`}>
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon className={`h-4 w-4 ${c.text}`} />
        <span className={`text-2xl font-bold ${c.text}`}>{value}</span>
      </div>
      <div className={`text-xs ${c.label}`}>{label}</div>
    </div>
  );
}
