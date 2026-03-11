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
  AlertTriangle,
  Users,
} from "lucide-react";

interface ReplacementCandidate {
  id: string;
  employeeId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  respondedAt: string | null;
  employee: { id: string; firstName: string; lastName: string };
}

interface ReplacementOffer {
  id: string;
  shiftId: string;
  storeId: string;
  absentEmployeeId: string;
  absenceId: string | null;
  status: "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED";
  filledByEmployeeId: string | null;
  expiresAt: string;
  createdAt: string;
  shift: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
  };
  store: { id: string; name: string };
  absentEmployee: { id: string; firstName: string; lastName: string } | null;
  candidates: ReplacementCandidate[];
}

interface StoreOption {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  OPEN: { label: "En cours", bg: "bg-orange-100", text: "text-orange-700" },
  FILLED: { label: "Pourvu", bg: "bg-green-100", text: "text-green-700" },
  EXPIRED: { label: "Non pourvu", bg: "bg-red-100", text: "text-red-700" },
  CANCELLED: { label: "Annulé", bg: "bg-gray-100", text: "text-gray-600" },
};

export default function RemplacementsPage() {
  const [offers, setOffers] = useState<ReplacementOffer[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [storeFilter, setStoreFilter] = useState("all");
  const [selectedOffer, setSelectedOffer] = useState<ReplacementOffer | null>(null);

  const loadStores = useCallback(async () => {
    const res = await fetch("/api/stores?limit=100");
    if (res.ok) {
      const data = await res.json();
      setStores(data.stores.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
    }
  }, []);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (storeFilter !== "all") params.set("storeId", storeFilter);

    // Also check expirations
    fetch("/api/replacements/expired", { method: "POST" }).catch(() => {});

    const res = await fetch(`/api/replacements?${params}`);
    if (res.ok) {
      const data = await res.json();
      setOffers(data.offers || []);
    }
    setLoading(false);
  }, [statusFilter, storeFilter]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const openCount = offers.filter((o) => o.status === "OPEN").length;
  const expiredCount = offers.filter((o) => o.status === "EXPIRED").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Remplacements
        </h1>
        <div className="flex gap-2">
          {openCount > 0 && (
            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
              {openCount} en cours
            </Badge>
          )}
          {expiredCount > 0 && (
            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
              {expiredCount} non pourvus
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "OPEN", label: "En cours" },
            { value: "FILLED", label: "Pourvus" },
            { value: "EXPIRED", label: "Non pourvus" },
            { value: "ALL", label: "Tous" },
          ]}
          className="w-full sm:w-48"
        />
        <Select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          options={[
            { value: "all", label: "Tous les magasins" },
            ...stores.map((s) => ({ value: s.id, label: s.name })),
          ]}
          className="w-full sm:w-56"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : offers.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
          Aucun remplacement
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {offers.map((o) => (
              <MobileCard
                key={o.id}
                offer={o}
                onSelect={() => setSelectedOffer(o)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Shift</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Magasin</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Absent</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Candidats</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Remplaçant</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Détails</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const statusConf = STATUS_CONFIG[o.status];
                  const responded = o.candidates.filter(
                    (c) => c.status !== "PENDING"
                  ).length;
                  const total = o.candidates.length;
                  const acceptedCandidate = o.candidates.find(
                    (c) => c.status === "ACCEPTED"
                  );

                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 ${
                        o.status === "EXPIRED" ? "bg-red-50/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {formatDateShort(o.shift.date)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {o.shift.startTime}-{o.shift.endTime}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{o.store.name}</td>
                      <td className="px-4 py-3">
                        {o.absentEmployee
                          ? `${o.absentEmployee.firstName} ${o.absentEmployee.lastName}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs">
                          {responded}/{total} réponses
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          className={`${statusConf.bg} ${statusConf.text} hover:${statusConf.bg}`}
                        >
                          {o.status === "EXPIRED" && (
                            <AlertTriangle className="h-3 w-3 mr-1" />
                          )}
                          {o.status === "FILLED" && (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          {statusConf.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {acceptedCandidate
                          ? `${acceptedCandidate.employee.firstName} ${acceptedCandidate.employee.lastName}`
                          : o.status === "EXPIRED"
                          ? <span className="text-red-600 font-medium text-xs">Non pourvu</span>
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          className="text-xs text-blue-600 hover:text-blue-800"
                          onClick={() => setSelectedOffer(o)}
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Detail dialog */}
      <Dialog
        open={!!selectedOffer}
        onOpenChange={(open) => {
          if (!open) setSelectedOffer(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Détail du remplacement</DialogTitle>
            <DialogDescription>
              {selectedOffer?.store.name} ·{" "}
              {selectedOffer && formatDateShort(selectedOffer.shift.date)}{" "}
              {selectedOffer?.shift.startTime}-{selectedOffer?.shift.endTime}
            </DialogDescription>
          </DialogHeader>

          {selectedOffer && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Absent :</span>
                  <span className="font-medium">
                    {selectedOffer.absentEmployee
                      ? `${selectedOffer.absentEmployee.firstName} ${selectedOffer.absentEmployee.lastName}`
                      : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Statut :</span>
                  <Badge
                    className={`${STATUS_CONFIG[selectedOffer.status].bg} ${STATUS_CONFIG[selectedOffer.status].text}`}
                  >
                    {STATUS_CONFIG[selectedOffer.status].label}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Expire :</span>
                  <span>{formatDateTime(selectedOffer.expiresAt)}</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4" />
                  Candidats ({selectedOffer.candidates.length})
                </h3>
                <div className="space-y-2">
                  {selectedOffer.candidates.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
                    >
                      <span className="text-sm font-medium">
                        {c.employee.firstName} {c.employee.lastName}
                      </span>
                      <CandidateStatusBadge status={c.status} />
                    </div>
                  ))}
                  {selectedOffer.candidates.length === 0 && (
                    <p className="text-xs text-gray-400">Aucun candidat éligible</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileCard({
  offer,
  onSelect,
}: {
  offer: ReplacementOffer;
  onSelect: () => void;
}) {
  const statusConf = STATUS_CONFIG[offer.status];
  const responded = offer.candidates.filter((c) => c.status !== "PENDING").length;
  const total = offer.candidates.length;
  const acceptedCandidate = offer.candidates.find((c) => c.status === "ACCEPTED");

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-white border rounded-lg p-4 space-y-2 hover:bg-gray-50 transition-colors ${
        offer.status === "EXPIRED"
          ? "border-red-200 bg-red-50/30"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {formatDateShort(offer.shift.date)} · {offer.shift.startTime}-
            {offer.shift.endTime}
          </p>
          <p className="text-xs text-gray-500">{offer.store.name}</p>
        </div>
        <Badge className={`${statusConf.bg} ${statusConf.text} text-[10px]`}>
          {statusConf.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span>
          Absent :{" "}
          {offer.absentEmployee
            ? `${offer.absentEmployee.firstName} ${offer.absentEmployee.lastName}`
            : "-"}
        </span>
        <span>{responded}/{total} réponses</span>
      </div>

      {acceptedCandidate && (
        <p className="text-xs text-green-700 font-medium">
          Remplaçant : {acceptedCandidate.employee.firstName}{" "}
          {acceptedCandidate.employee.lastName}
        </p>
      )}

      {offer.status === "EXPIRED" && !acceptedCandidate && (
        <p className="text-xs text-red-600 font-medium flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Non pourvu — action requise
        </p>
      )}
    </button>
  );
}

function CandidateStatusBadge({ status }: { status: string }) {
  if (status === "ACCEPTED") {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Accepté
      </Badge>
    );
  }
  if (status === "DECLINED") {
    return (
      <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 text-[10px]">
        <XCircle className="h-3 w-3 mr-1" />
        Refusé
      </Badge>
    );
  }
  if (status === "EXPIRED") {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 text-[10px]">
        Expiré
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">
      <Clock className="h-3 w-3 mr-1" />
      En attente
    </Badge>
  );
}

function formatDateShort(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("fr-FR", {
    weekday: "short",
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
