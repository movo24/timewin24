"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  AlertTriangle,
  Plus,
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Paperclip,
  X,
} from "lucide-react";

interface AbsenceDeclaration {
  id: string;
  type: string;
  reason: string | null;
  startDate: string;
  endDate: string;
  documentPath: string | null;
  documentName: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  managerResponse: string | null;
  processedAt: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  MALADIE: "Arrêt maladie",
  CONGE: "Congé",
  PERSONNEL: "Raison personnelle",
  ACCIDENT: "Accident du travail",
  AUTRE: "Autre",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  PENDING: { label: "En attente", bg: "bg-yellow-100", text: "text-yellow-700" },
  APPROVED: { label: "Approuvée", bg: "bg-green-100", text: "text-green-700" },
  REJECTED: { label: "Refusée", bg: "bg-red-100", text: "text-red-700" },
};

export default function AbsencesPage() {
  const [declarations, setDeclarations] = useState<AbsenceDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [type, setType] = useState("MALADIE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [document, setDocument] = useState<File | null>(null);

  const loadDeclarations = useCallback(async () => {
    const res = await fetch("/api/absences");
    if (res.ok) {
      const data = await res.json();
      setDeclarations(data.declarations || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDeclarations();
  }, [loadDeclarations]);

  function resetForm() {
    setType("MALADIE");
    setStartDate("");
    setEndDate("");
    setReason("");
    setDocument(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("startDate", startDate);
      formData.append("endDate", endDate || startDate);
      if (reason) formData.append("reason", reason);
      if (document) formData.append("document", document);

      const res = await fetch("/api/absences", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la déclaration");
        setSubmitting(false);
        return;
      }

      setSuccess("Déclaration envoyée avec succès");
      resetForm();
      setShowForm(false);
      await loadDeclarations();
      setTimeout(() => setSuccess(""), 4000);
    } catch {
      setError("Erreur réseau");
    }

    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Mes Absences</h1>
        <Button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Signaler absence
        </Button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* Pending declarations */}
      {declarations.filter((d) => d.status === "PENDING").length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">En attente de validation</h2>
          {declarations
            .filter((d) => d.status === "PENDING")
            .map((d) => (
              <DeclarationCard key={d.id} declaration={d} />
            ))}
        </div>
      )}

      {/* All declarations */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Historique</h2>
        {declarations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
            Aucune déclaration d&apos;absence
          </div>
        ) : (
          declarations
            .filter((d) => d.status !== "PENDING")
            .map((d) => <DeclarationCard key={d.id} declaration={d} />)
        )}
        {declarations.filter((d) => d.status !== "PENDING").length === 0 &&
          declarations.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-500 text-sm">
              Aucune déclaration traitée
            </div>
          )}
      </div>

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Signaler une absence</DialogTitle>
            <DialogDescription>
              Remplissez ce formulaire pour déclarer une absence ou un arrêt maladie.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Type d&apos;absence
              </label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  { value: "MALADIE", label: "Arrêt maladie" },
                  { value: "CONGE", label: "Congé" },
                  { value: "PERSONNEL", label: "Raison personnelle" },
                  { value: "ACCIDENT", label: "Accident du travail" },
                  { value: "AUTRE", label: "Autre" },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Date de début
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Date de fin
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Message / Motif
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Décrivez la raison de votre absence..."
                className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Document justificatif
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setDocument(e.target.files?.[0] || null)}
                className="hidden"
              />
              {document ? (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Paperclip className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-sm text-blue-800 truncate flex-1">
                    {document.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDocument(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Joindre un document (photo, PDF)
                </Button>
              )}
              <p className="text-xs text-gray-400">
                Certificat médical, justificatif... (JPEG, PNG, PDF, max 50 Mo)
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowForm(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-orange-600 hover:bg-orange-700"
                disabled={submitting || !startDate}
              >
                {submitting ? "Envoi..." : "Envoyer la déclaration"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeclarationCard({ declaration }: { declaration: AbsenceDeclaration }) {
  const statusConf = STATUS_CONFIG[declaration.status];
  const startStr = formatDate(declaration.startDate);
  const endStr = formatDate(declaration.endDate);
  const isSameDay = declaration.startDate.split("T")[0] === declaration.endDate.split("T")[0];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {declaration.status === "PENDING" ? (
            <Clock className="h-4 w-4 text-yellow-600" />
          ) : declaration.status === "APPROVED" ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )}
          <span className="text-sm font-medium text-gray-900">
            {TYPE_LABELS[declaration.type] || declaration.type}
          </span>
        </div>
        <Badge className={`${statusConf.bg} ${statusConf.text} hover:${statusConf.bg}`}>
          {statusConf.label}
        </Badge>
      </div>

      <div className="text-xs text-gray-600">
        <p>
          {isSameDay ? startStr : `${startStr} → ${endStr}`}
        </p>
        {declaration.reason && (
          <p className="mt-1 text-gray-500">{declaration.reason}</p>
        )}
      </div>

      {declaration.documentName && (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <FileText className="h-3 w-3" />
          <a
            href={`/api/uploads/${declaration.documentPath}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {declaration.documentName}
          </a>
        </div>
      )}

      {declaration.managerResponse && (
        <div className="bg-gray-50 rounded p-2 mt-2">
          <p className="text-xs text-gray-500 font-medium mb-0.5">Réponse du manager :</p>
          <p className="text-xs text-gray-700">{declaration.managerResponse}</p>
        </div>
      )}

      <p className="text-[10px] text-gray-400">
        Déclaré le {formatDateTime(declaration.createdAt)}
      </p>
    </div>
  );
}

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
