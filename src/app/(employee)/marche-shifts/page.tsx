"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  Clock,
  MapPin,
  Timer,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
} from "lucide-react";

interface ShiftInfo {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface Listing {
  id: string;
  posterId: string;
  shiftId: string;
  storeId: string;
  claimantId: string | null;
  status: string;
  posterMessage: string | null;
  claimantMessage: string | null;
  managerResponse: string | null;
  constraintChecks: ConstraintChecks | null;
  expiresAt: string;
  claimedAt: string | null;
  createdAt: string;
  shift: ShiftInfo | null;
  store: { id: string; name: string } | null;
  poster: { id: string; firstName: string; lastName: string } | null;
  claimant: { id: string; firstName: string; lastName: string } | null;
}

interface ConstraintChecks {
  eligible: boolean;
  overlapOk: boolean;
  weeklyHoursOk: boolean;
  dailyHoursOk: boolean;
  restOk: boolean;
  availabilityOk: boolean;
}

type Tab = "available" | "mine";

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  OPEN: { label: "Disponible", bg: "bg-emerald-100", text: "text-emerald-700" },
  CLAIMED: { label: "En validation", bg: "bg-orange-100", text: "text-orange-700" },
  APPROVED: { label: "Approuvé", bg: "bg-green-100", text: "text-green-700" },
  REJECTED: { label: "Refusé", bg: "bg-red-100", text: "text-red-700" },
  CANCELLED: { label: "Annulé", bg: "bg-gray-100", text: "text-gray-600" },
  EXPIRED: { label: "Expiré", bg: "bg-gray-100", text: "text-gray-500" },
};

export default function MarcheShiftsPage() {
  const [tab, setTab] = useState<Tab>("available");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Expire stale listings
    fetch("/api/market-listings/expired", { method: "POST" }).catch(() => {});

    const url = tab === "mine"
      ? "/api/market-listings?mine=true"
      : "/api/market-listings";

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setListings(data.listings || []);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  async function handleClaim(listingId: string) {
    setActionLoading(listingId);
    setError(null);
    try {
      const res = await fetch(`/api/market-listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la réclamation");
      } else {
        loadListings();
      }
    } catch {
      setError("Erreur réseau");
    }
    setActionLoading(null);
  }

  async function handleCancel(listingId: string) {
    setActionLoading(listingId);
    try {
      const res = await fetch(`/api/market-listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) loadListings();
    } catch { /* silent */ }
    setActionLoading(null);
  }

  async function handleUnclaim(listingId: string) {
    setActionLoading(listingId);
    try {
      const res = await fetch(`/api/market-listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unclaim" }),
      });
      if (res.ok) loadListings();
    } catch { /* silent */ }
    setActionLoading(null);
  }

  const activeListings = listings.filter((l) => ["OPEN", "CLAIMED"].includes(l.status));
  const pastListings = listings.filter((l) => !["OPEN", "CLAIMED"].includes(l.status));
  const [showPast, setShowPast] = useState(false);

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingBag className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">Marché aux Shifts</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 mb-4">
        <button
          className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
            tab === "available"
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("available")}
        >
          Shifts disponibles
        </button>
        <button
          className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
            tab === "mine"
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("mine")}
        >
          Mes publications
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : activeListings.length === 0 && pastListings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <ShoppingBag className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {tab === "available"
              ? "Aucun shift disponible pour le moment"
              : "Vous n'avez publié aucun shift"}
          </p>
          {tab === "mine" && (
            <p className="text-xs text-gray-400 mt-1">
              Publiez un shift depuis votre planning
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {activeListings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              tab={tab}
              actionLoading={actionLoading}
              onClaim={() => handleClaim(l.id)}
              onCancel={() => handleCancel(l.id)}
              onUnclaim={() => handleUnclaim(l.id)}
            />
          ))}

          {pastListings.length > 0 && (
            <>
              <button
                onClick={() => setShowPast(!showPast)}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-2"
              >
                {showPast ? "Masquer" : "Voir"} l&apos;historique ({pastListings.length})
              </button>
              {showPast &&
                pastListings.map((l) => (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    tab={tab}
                    actionLoading={actionLoading}
                    onClaim={() => {}}
                    onCancel={() => {}}
                    onUnclaim={() => {}}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  tab,
  actionLoading,
  onClaim,
  onCancel,
  onUnclaim,
}: {
  listing: Listing;
  tab: Tab;
  actionLoading: string | null;
  onClaim: () => void;
  onCancel: () => void;
  onUnclaim: () => void;
}) {
  const statusConf = STATUS_CONFIG[listing.status] || STATUS_CONFIG.OPEN;
  const shift = listing.shift;
  if (!shift) return null;

  const hours = calculateHours(shift.startTime, shift.endTime);
  const expiresIn = getExpiresIn(listing.expiresAt);
  const isLoading = actionLoading === listing.id;

  return (
    <div
      className={`bg-white border rounded-lg p-4 space-y-3 ${
        listing.status === "EXPIRED" ? "border-gray-200 opacity-60" : "border-gray-200"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {formatDateShort(shift.date)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1 text-sm text-gray-700">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              {shift.startTime} - {shift.endTime}
            </div>
            <span className="text-xs text-gray-400">({hours.toFixed(1)}h)</span>
          </div>
        </div>
        <Badge className={`${statusConf.bg} ${statusConf.text} text-[10px]`}>
          {statusConf.label}
        </Badge>
      </div>

      {/* Store + poster */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {listing.store?.name || "—"}
        </span>
        {tab === "available" && listing.poster && (
          <span>Proposé par {listing.poster.firstName}</span>
        )}
      </div>

      {/* Poster message */}
      {listing.posterMessage && (
        <p className="text-xs text-gray-500 italic bg-gray-50 rounded px-2 py-1">
          &ldquo;{listing.posterMessage}&rdquo;
        </p>
      )}

      {/* Claimant info (for poster's view) */}
      {tab === "mine" && listing.status === "CLAIMED" && listing.claimant && (
        <div className="bg-orange-50 rounded-lg p-2 text-xs">
          <p className="font-medium text-orange-700">
            Réclamé par {listing.claimant.firstName} {listing.claimant.lastName}
          </p>
          {listing.constraintChecks && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              <ConstraintBadge ok={listing.constraintChecks.overlapOk} label="Pas de conflit" />
              <ConstraintBadge ok={listing.constraintChecks.weeklyHoursOk} label="Heures/sem" />
              <ConstraintBadge ok={listing.constraintChecks.dailyHoursOk} label="Heures/jour" />
              <ConstraintBadge ok={listing.constraintChecks.restOk} label="Repos 11h" />
              <ConstraintBadge ok={listing.constraintChecks.availabilityOk} label="Disponible" />
            </div>
          )}
          <p className="text-orange-600 mt-1.5">En attente de validation manager</p>
        </div>
      )}

      {/* Manager response */}
      {listing.managerResponse && (
        <p className="text-xs text-gray-500">
          Manager : &ldquo;{listing.managerResponse}&rdquo;
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        {listing.status === "OPEN" && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Timer className="h-3 w-3" />
            {expiresIn}
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          {/* Available tab: claim button */}
          {tab === "available" && listing.status === "OPEN" && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
              onClick={onClaim}
              disabled={isLoading}
            >
              {isLoading ? "..." : "Réclamer"}
            </Button>
          )}

          {/* Available tab: unclaim button (if user claimed it) */}
          {tab === "available" && listing.status === "CLAIMED" && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={onUnclaim}
              disabled={isLoading}
            >
              Annuler ma réclamation
            </Button>
          )}

          {/* Mine tab: cancel button */}
          {tab === "mine" && ["OPEN", "CLAIMED"].includes(listing.status) && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50"
              onClick={onCancel}
              disabled={isLoading}
            >
              Retirer du marché
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConstraintBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${
        ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

function calculateHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

function formatDateShort(isoStr: string): string {
  const d = new Date(isoStr.includes("T") ? isoStr : isoStr + "T00:00:00Z");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function getExpiresIn(isoStr: string): string {
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff <= 0) return "Expiré";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}j restants`;
  if (hours > 0) return `${hours}h${minutes > 0 ? String(minutes).padStart(2, "0") : ""} restantes`;
  return `${minutes}min restantes`;
}
