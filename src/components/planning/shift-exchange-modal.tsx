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
  ArrowLeftRight,
  Clock,
  MapPin,
  Search,
  Loader2,
  Send,
  User,
} from "lucide-react";

interface ShiftInfo {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  store: { id: string; name: string; city?: string | null };
}

interface Colleague {
  id: string;
  firstName: string;
  lastName: string;
}

interface ShiftExchangeModalProps {
  open: boolean;
  onClose: () => void;
  shift: ShiftInfo;
  onCreated: () => void;
}

function formatDateFr(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

export function ShiftExchangeModal({
  open,
  onClose,
  shift,
  onCreated,
}: ShiftExchangeModalProps) {
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  const [selectedColleague, setSelectedColleague] = useState<Colleague | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load colleagues when modal opens
  useEffect(() => {
    if (!open) return;
    setSelectedColleague(null);
    setSearch("");
    setMessage("");
    setError("");

    async function load() {
      setLoadingColleagues(true);
      try {
        const res = await fetch(`/api/me/colleagues?storeId=${shift.store.id}`);
        if (res.ok) {
          const data = await res.json();
          setColleagues(data.colleagues || []);
        }
      } catch {
        // silent
      }
      setLoadingColleagues(false);
    }
    load();
  }, [open, shift.store.id]);

  const filtered = colleagues.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q)
    );
  });

  async function handleSubmit() {
    if (!selectedColleague) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/shift-exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: selectedColleague.id,
          requesterShiftId: shift.id,
          message: message.trim() || undefined,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || "Erreur lors de la création de la demande.");
      }
    } catch {
      setError("Erreur réseau.");
    }
    setSubmitting(false);
  }

  const dateStr =
    typeof shift.date === "string"
      ? shift.date.split("T")[0]
      : shift.date;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-violet-500" />
            Proposer un échange
          </DialogTitle>
          <DialogDescription>
            Demander à un collègue de prendre votre shift
          </DialogDescription>
        </DialogHeader>

        {/* Your shift info */}
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
          <p className="text-xs font-medium text-violet-600 mb-1">
            Votre shift
          </p>
          <div className="text-sm text-gray-800 font-medium">
            {formatDateFr(dateStr)}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {shift.startTime} – {shift.endTime}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {shift.store.name}
            </span>
          </div>
        </div>

        {/* Colleague selection */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">
            Choisir un collègue
          </label>

          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            />
          </div>

          {/* List */}
          <div className="max-h-[200px] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {loadingColleagues ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Chargement...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                Aucun collègue trouvé
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
                    selectedColleague?.id === c.id
                      ? "bg-violet-50 text-violet-700"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                  onClick={() => setSelectedColleague(c)}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      selectedColleague?.id === c.id
                        ? "bg-violet-200 text-violet-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.firstName[0]}
                    {c.lastName[0]}
                  </div>
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  {selectedColleague?.id === c.id && (
                    <span className="ml-auto text-violet-500 text-xs font-medium">
                      Sélectionné
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message (optional) */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">
            Message (optionnel)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex: J'ai un RDV ce jour-là, est-ce que tu peux me remplacer ?"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={handleSubmit}
            disabled={!selectedColleague || submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Envoyer la demande
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
