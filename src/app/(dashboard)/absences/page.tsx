"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
  XCircle,
  Clock,
  FileText,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

interface AbsenceDeclaration {
  id: string;
  type: string;
  reason: string | null;
  startDate: string;
  endDate: string;
  documentPath: string | null;
  documentName: string | null;
  documentMime: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  managerResponse: string | null;
  processedAt: string | null;
  createdAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    stores: { store: { id: string; name: string } }[];
  };
}

const TYPE_LABELS: Record<string, string> = {
  MALADIE: "Arrêt maladie",
  CONGE: "Congé",
  PERSONNEL: "Raison personnelle",
  ACCIDENT: "Accident du travail",
  AUTRE: "Autre",
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  MALADIE: { bg: "bg-red-100", text: "text-red-700" },
  CONGE: { bg: "bg-blue-100", text: "text-blue-700" },
  PERSONNEL: { bg: "bg-purple-100", text: "text-purple-700" },
  ACCIDENT: { bg: "bg-orange-100", text: "text-orange-700" },
  AUTRE: { bg: "bg-gray-100", text: "text-gray-700" },
};

export default function AbsencesManagerPage() {
  const [declarations, setDeclarations] = useState<AbsenceDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selectedDeclaration, setSelectedDeclaration] = useState<AbsenceDeclaration | null>(null);
  const [responseText, setResponseText] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadDeclarations = useCallback(async () => {
    setLoading(true);
    const params = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/absences${params}`);
    if (res.ok) {
      const data = await res.json();
      setDeclarations(data.declarations || []);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    loadDeclarations();
  }, [loadDeclarations]);

  async function handleDecision(id: string, status: "APPROVED" | "REJECTED") {
    setProcessing(true);
    try {
      const res = await fetch(`/api/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          managerResponse: responseText || null,
        }),
      });

      if (res.ok) {
        setSelectedDeclaration(null);
        setResponseText("");
        await loadDeclarations();
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setProcessing(false);
    }
  }

  const pendingCount = declarations.filter((d) => d.status === "PENDING").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Déclarations d&apos;absence
        </h1>
        {statusFilter === "PENDING" && pendingCount > 0 && (
          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
            {pendingCount} en attente
          </Badge>
        )}
      </div>

      {/* Filter */}
      <div className="mb-4">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "PENDING", label: "En attente" },
            { value: "APPROVED", label: "Approuvées" },
            { value: "REJECTED", label: "Refusées" },
            { value: "ALL", label: "Toutes" },
          ]}
          className="w-full sm:w-56"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : declarations.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
          {statusFilter === "PENDING"
            ? "Aucune déclaration en attente"
            : "Aucune déclaration"}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {declarations.map((d) => (
              <MobileCard
                key={d.id}
                declaration={d}
                onSelect={() => {
                  setSelectedDeclaration(d);
                  setResponseText("");
                }}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employé</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Période</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Motif</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Document</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {declarations.map((d) => {
                  const typeColor = TYPE_COLORS[d.type] || TYPE_COLORS.AUTRE;
                  const isSameDay = d.startDate.split("T")[0] === d.endDate.split("T")[0];
                  return (
                    <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">
                            {d.employee.firstName} {d.employee.lastName}
                          </p>
                          {d.employee.stores.length > 0 && (
                            <p className="text-xs text-gray-500">
                              {d.employee.stores.map((s) => s.store.name).join(", ")}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${typeColor.bg} ${typeColor.text} hover:${typeColor.bg}`}>
                          {TYPE_LABELS[d.type] || d.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {isSameDay
                          ? formatDateShort(d.startDate)
                          : `${formatDateShort(d.startDate)} → ${formatDateShort(d.endDate)}`}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                        {d.reason || "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.documentPath ? (
                          <a
                            href={`/api/uploads/${d.documentPath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.status === "PENDING" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedDeclaration(d);
                              setResponseText("");
                            }}
                          >
                            Traiter
                          </Button>
                        ) : (
                          <button
                            className="text-xs text-gray-500 hover:text-gray-700"
                            onClick={() => {
                              setSelectedDeclaration(d);
                              setResponseText("");
                            }}
                          >
                            Détails
                          </button>
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

      {/* Detail / Decision dialog */}
      <Dialog
        open={!!selectedDeclaration}
        onOpenChange={(open) => {
          if (!open) setSelectedDeclaration(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Déclaration d&apos;absence</DialogTitle>
            <DialogDescription>
              {selectedDeclaration?.employee.firstName}{" "}
              {selectedDeclaration?.employee.lastName}
            </DialogDescription>
          </DialogHeader>

          {selectedDeclaration && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge
                    className={`${TYPE_COLORS[selectedDeclaration.type]?.bg || "bg-gray-100"} ${TYPE_COLORS[selectedDeclaration.type]?.text || "text-gray-700"}`}
                  >
                    {TYPE_LABELS[selectedDeclaration.type] || selectedDeclaration.type}
                  </Badge>
                  <StatusBadge status={selectedDeclaration.status} />
                </div>

                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Période :</span>
                    <span className="font-medium">
                      {selectedDeclaration.startDate.split("T")[0] ===
                      selectedDeclaration.endDate.split("T")[0]
                        ? formatDateShort(selectedDeclaration.startDate)
                        : `${formatDateShort(selectedDeclaration.startDate)} → ${formatDateShort(selectedDeclaration.endDate)}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Déclaré le :</span>
                    <span>{formatDateTime(selectedDeclaration.createdAt)}</span>
                  </div>
                  {selectedDeclaration.employee.stores.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Magasin(s) :</span>
                      <span>
                        {selectedDeclaration.employee.stores
                          .map((s) => s.store.name)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </div>

                {selectedDeclaration.reason && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Message :</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded p-3">
                      {selectedDeclaration.reason}
                    </p>
                  </div>
                )}

                {selectedDeclaration.documentPath && (
                  <a
                    href={`/api/uploads/${selectedDeclaration.documentPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 hover:bg-blue-100"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{selectedDeclaration.documentName}</span>
                  </a>
                )}

                {selectedDeclaration.managerResponse && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Réponse du manager :
                    </p>
                    <p className="text-sm text-gray-700">
                      {selectedDeclaration.managerResponse}
                    </p>
                  </div>
                )}
              </div>

              {selectedDeclaration.status === "PENDING" && (
                <div className="space-y-3 border-t border-gray-200 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Réponse (optionnel)
                    </label>
                    <textarea
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={2}
                      placeholder="Message pour l'employé..."
                      className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() =>
                        handleDecision(selectedDeclaration.id, "REJECTED")
                      }
                      disabled={processing}
                    >
                      <ThumbsDown className="h-4 w-4 mr-2" />
                      Refuser
                    </Button>
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() =>
                        handleDecision(selectedDeclaration.id, "APPROVED")
                      }
                      disabled={processing}
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Approuver
                    </Button>
                  </div>

                  <p className="text-xs text-gray-400 text-center">
                    L&apos;approbation crée automatiquement les indisponibilités dans le planning.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileCard({
  declaration,
  onSelect,
}: {
  declaration: AbsenceDeclaration;
  onSelect: () => void;
}) {
  const typeColor = TYPE_COLORS[declaration.type] || TYPE_COLORS.AUTRE;
  const isSameDay =
    declaration.startDate.split("T")[0] === declaration.endDate.split("T")[0];

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 space-y-2 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {declaration.employee.firstName} {declaration.employee.lastName}
          </p>
          {declaration.employee.stores.length > 0 && (
            <p className="text-xs text-gray-500">
              {declaration.employee.stores.map((s) => s.store.name).join(", ")}
            </p>
          )}
        </div>
        <StatusBadge status={declaration.status} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={`${typeColor.bg} ${typeColor.text} text-[10px]`}>
          {TYPE_LABELS[declaration.type] || declaration.type}
        </Badge>
        <span className="text-xs text-gray-600">
          {isSameDay
            ? formatDateShort(declaration.startDate)
            : `${formatDateShort(declaration.startDate)} → ${formatDateShort(declaration.endDate)}`}
        </span>
      </div>

      {declaration.reason && (
        <p className="text-xs text-gray-500 truncate">{declaration.reason}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-400">
        {declaration.documentPath && (
          <span className="flex items-center gap-1 text-blue-500">
            <FileText className="h-3 w-3" />
            Document joint
          </span>
        )}
        <span>Déclaré le {formatDateShort(declaration.createdAt)}</span>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PENDING") {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
        <Clock className="h-3 w-3 mr-1" />
        En attente
      </Badge>
    );
  }
  if (status === "APPROVED") {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Approuvée
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
      <XCircle className="h-3 w-3 mr-1" />
      Refusée
    </Badge>
  );
}

function formatDateShort(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
