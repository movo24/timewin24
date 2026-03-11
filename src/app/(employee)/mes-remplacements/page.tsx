"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Calendar,
  Timer,
} from "lucide-react";

interface ReplacementCandidate {
  id: string;
  offerId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  respondedAt: string | null;
  createdAt: string;
  offer: {
    id: string;
    status: "OPEN" | "FILLED" | "EXPIRED" | "CANCELLED";
    expiresAt: string;
    shift: {
      id: string;
      date: string;
      startTime: string;
      endTime: string;
    };
    store: {
      id: string;
      name: string;
    };
  };
}

export default function MesRemplacementsPage() {
  const [candidates, setCandidates] = useState<ReplacementCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadCandidates = useCallback(async () => {
    const status = showHistory ? "ALL" : "PENDING";
    const res = await fetch(`/api/replacements?candidateStatus=${status}`);
    if (res.ok) {
      const data = await res.json();
      setCandidates(data.candidates || []);
    }
    setLoading(false);
  }, [showHistory]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  async function handleRespond(offerId: string, action: "accept" | "decline") {
    setResponding(offerId);
    const res = await fetch(`/api/replacements/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (res.ok) {
      await loadCandidates();
    } else {
      const data = await res.json();
      alert(data.error || "Erreur");
    }
    setResponding(null);
  }

  const pendingCandidates = candidates.filter((c) => c.status === "PENDING" && c.offer.status === "OPEN");
  const historyCandidates = candidates.filter((c) => c.status !== "PENDING" || c.offer.status !== "OPEN");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Remplacements</h1>

      {/* Pending offers */}
      {pendingCandidates.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            Shifts disponibles ({pendingCandidates.length})
          </h2>
          {pendingCandidates.map((c) => (
            <OfferCard
              key={c.id}
              candidate={c}
              onAccept={() => handleRespond(c.offerId, "accept")}
              onDecline={() => handleRespond(c.offerId, "decline")}
              responding={responding === c.offerId}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
          Aucun shift disponible pour le moment
        </div>
      )}

      {/* History toggle */}
      <div className="border-t border-gray-200 pt-4">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {showHistory ? "Masquer l'historique" : "Voir l'historique"}
        </button>

        {showHistory && historyCandidates.length > 0 && (
          <div className="space-y-2 mt-3">
            {historyCandidates.map((c) => (
              <HistoryCard key={c.id} candidate={c} />
            ))}
          </div>
        )}
        {showHistory && historyCandidates.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">Aucun historique</p>
        )}
      </div>
    </div>
  );
}

function OfferCard({
  candidate,
  onAccept,
  onDecline,
  responding,
}: {
  candidate: ReplacementCandidate;
  onAccept: () => void;
  onDecline: () => void;
  responding: boolean;
}) {
  const shift = candidate.offer.shift;
  const store = candidate.offer.store;
  const shiftDate = new Date(shift.date);
  const expiresAt = new Date(candidate.offer.expiresAt);
  const now = new Date();
  const hoursLeft = Math.max(0, (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));

  const [sh, sm] = shift.startTime.split(":").map(Number);
  const [eh, em] = shift.endTime.split(":").map(Number);
  const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;

  return (
    <div className="bg-white border-2 border-orange-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Shift disponible</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
            <MapPin className="h-3 w-3" />
            <span>{store.name}</span>
          </div>
        </div>
        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
          <Timer className="h-3 w-3 mr-1" />
          {hoursLeft < 1
            ? `${Math.round(hoursLeft * 60)}min`
            : `${Math.round(hoursLeft)}h`}
        </Badge>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-4">
        <Calendar className="h-5 w-5 text-gray-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-900">
            {shiftDate.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <p className="text-sm text-gray-600">
            {shift.startTime} - {shift.endTime}{" "}
            <span className="text-gray-400">({hours}h)</span>
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 border-gray-300"
          onClick={onDecline}
          disabled={responding}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Refuser
        </Button>
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700"
          onClick={onAccept}
          disabled={responding}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {responding ? "..." : "Accepter"}
        </Button>
      </div>
    </div>
  );
}

function HistoryCard({ candidate }: { candidate: ReplacementCandidate }) {
  const shift = candidate.offer.shift;
  const store = candidate.offer.store;

  const statusConfig = {
    ACCEPTED: { label: "Accepté", bg: "bg-green-100", text: "text-green-700", Icon: CheckCircle2 },
    DECLINED: { label: "Refusé", bg: "bg-gray-100", text: "text-gray-600", Icon: XCircle },
    EXPIRED: { label: "Expiré", bg: "bg-yellow-100", text: "text-yellow-700", Icon: Clock },
    PENDING: { label: "En attente", bg: "bg-yellow-100", text: "text-yellow-700", Icon: Clock },
  };

  const conf = statusConfig[candidate.status] || statusConfig.EXPIRED;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      <conf.Icon className={`h-4 w-4 shrink-0 ${conf.text}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900">
          {new Date(shift.date).toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          · {shift.startTime}-{shift.endTime}
        </p>
        <p className="text-xs text-gray-500">{store.name}</p>
      </div>
      <Badge className={`${conf.bg} ${conf.text} text-[10px]`}>
        {conf.label}
      </Badge>
    </div>
  );
}
