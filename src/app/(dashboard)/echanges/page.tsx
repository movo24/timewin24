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
  ArrowLeftRight,
  ShoppingBag,
  Clock,
  AlertTriangle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────

interface MarketListing {
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
  shift: { id: string; date: string; startTime: string; endTime: string } | null;
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

interface ShiftExchange {
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
  requester: { id: string; firstName: string; lastName: string } | null;
  target: { id: string; firstName: string; lastName: string } | null;
  requesterShift: { id: string; date: string; startTime: string; endTime: string; store: { id: string; name: string } } | null;
  targetShift: { id: string; date: string; startTime: string; endTime: string; store: { id: string; name: string } } | null;
}

interface StoreOption {
  id: string;
  name: string;
}

type Tab = "marketplace" | "exchanges";

const MARKET_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  OPEN: { label: "Disponible", bg: "bg-emerald-100", text: "text-emerald-700" },
  CLAIMED: { label: "À valider", bg: "bg-orange-100", text: "text-orange-700" },
  APPROVED: { label: "Approuvé", bg: "bg-green-100", text: "text-green-700" },
  REJECTED: { label: "Refusé", bg: "bg-red-100", text: "text-red-700" },
  CANCELLED: { label: "Annulé", bg: "bg-gray-100", text: "text-gray-600" },
  EXPIRED: { label: "Expiré", bg: "bg-gray-100", text: "text-gray-500" },
};

const EXCHANGE_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  PENDING_PEER: { label: "Attente collègue", bg: "bg-blue-100", text: "text-blue-700" },
  PENDING_MANAGER: { label: "À valider", bg: "bg-orange-100", text: "text-orange-700" },
  APPROVED: { label: "Approuvé", bg: "bg-green-100", text: "text-green-700" },
  REJECTED_PEER: { label: "Refusé (collègue)", bg: "bg-red-100", text: "text-red-700" },
  REJECTED_MANAGER: { label: "Refusé (manager)", bg: "bg-red-100", text: "text-red-700" },
  CANCELLED: { label: "Annulé", bg: "bg-gray-100", text: "text-gray-600" },
  EXPIRED: { label: "Expiré", bg: "bg-gray-100", text: "text-gray-500" },
};

// ─── Main Page ───────────────────────────────────

export default function EchangesPage() {
  const [tab, setTab] = useState<Tab>("marketplace");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeFilter, setStoreFilter] = useState("all");

  // Marketplace state
  const [marketStatus, setMarketStatus] = useState("CLAIMED");
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null);

  // Exchanges state
  const [exchangeStatus, setExchangeStatus] = useState("PENDING_MANAGER");
  const [exchanges, setExchanges] = useState<ShiftExchange[]>([]);
  const [exchangeLoading, setExchangeLoading] = useState(true);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    const res = await fetch("/api/stores?limit=100");
    if (res.ok) {
      const data = await res.json();
      setStores(data.stores.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
    }
  }, []);

  const loadMarketListings = useCallback(async () => {
    setMarketLoading(true);
    // Expire stale listings
    fetch("/api/market-listings/expired", { method: "POST" }).catch(() => {});

    const params = new URLSearchParams();
    if (marketStatus !== "ALL") params.set("status", marketStatus);
    if (storeFilter !== "all") params.set("storeId", storeFilter);

    const res = await fetch(`/api/market-listings?${params}`);
    if (res.ok) {
      const data = await res.json();
      setListings(data.listings || []);
    }
    setMarketLoading(false);
  }, [marketStatus, storeFilter]);

  const loadExchanges = useCallback(async () => {
    setExchangeLoading(true);
    const params = new URLSearchParams();
    if (exchangeStatus !== "ALL") params.set("status", exchangeStatus);

    const res = await fetch(`/api/shift-exchanges?${params}`);
    if (res.ok) {
      const data = await res.json();
      setExchanges(data.exchanges || []);
    }
    setExchangeLoading(false);
  }, [exchangeStatus]);

  useEffect(() => { loadStores(); }, [loadStores]);
  useEffect(() => { loadMarketListings(); }, [loadMarketListings]);
  useEffect(() => { loadExchanges(); }, [loadExchanges]);

  async function handleMarketAction(listingId: string, action: string) {
    setActionLoading(listingId);
    try {
      const res = await fetch(`/api/market-listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        loadMarketListings();
        setSelectedListing(null);
      }
    } catch { /* silent */ }
    setActionLoading(null);
  }

  async function handleExchangeAction(exchangeId: string, action: string) {
    setActionLoading(exchangeId);
    try {
      const res = await fetch(`/api/shift-exchanges/${exchangeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) loadExchanges();
    } catch { /* silent */ }
    setActionLoading(null);
  }

  const claimedCount = listings.filter((l) => l.status === "CLAIMED").length;
  const pendingExchanges = exchanges.filter((e) => e.status === "PENDING_MANAGER").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Échanges & Marché
        </h1>
        <div className="flex gap-2">
          {claimedCount > 0 && (
            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
              {claimedCount} marché à valider
            </Badge>
          )}
          {pendingExchanges > 0 && (
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
              {pendingExchanges} échanges à valider
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 mb-4">
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            tab === "marketplace"
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("marketplace")}
        >
          <ShoppingBag className="h-4 w-4" />
          Marketplace
          {claimedCount > 0 && (
            <span className="bg-orange-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center">
              {claimedCount}
            </span>
          )}
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
            tab === "exchanges"
              ? "bg-white shadow-sm text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("exchanges")}
        >
          <ArrowLeftRight className="h-4 w-4" />
          Échanges directs
          {pendingExchanges > 0 && (
            <span className="bg-blue-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center">
              {pendingExchanges}
            </span>
          )}
        </button>
      </div>

      {/* ─── Marketplace Tab ─── */}
      {tab === "marketplace" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select
              value={marketStatus}
              onChange={(e) => setMarketStatus(e.target.value)}
              options={[
                { value: "CLAIMED", label: "À valider" },
                { value: "OPEN", label: "Disponibles" },
                { value: "APPROVED", label: "Approuvés" },
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

          {marketLoading ? (
            <Spinner />
          ) : listings.length === 0 ? (
            <EmptyState text="Aucun listing" />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 lg:hidden">
                {listings.map((l) => (
                  <MarketMobileCard
                    key={l.id}
                    listing={l}
                    actionLoading={actionLoading}
                    onApprove={() => handleMarketAction(l.id, "manager_approve")}
                    onReject={() => handleMarketAction(l.id, "manager_reject")}
                    onDetail={() => setSelectedListing(l)}
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
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Posteur</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Réclamant</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Contraintes</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((l) => {
                      const statusConf = MARKET_STATUS[l.status] || MARKET_STATUS.OPEN;
                      return (
                        <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {l.shift ? (
                              <>
                                <p className="font-medium">{formatDateShort(l.shift.date)}</p>
                                <p className="text-xs text-gray-500">{l.shift.startTime}-{l.shift.endTime}</p>
                              </>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{l.store?.name || "—"}</td>
                          <td className="px-4 py-3">
                            {l.poster ? `${l.poster.firstName} ${l.poster.lastName}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {l.claimant ? `${l.claimant.firstName} ${l.claimant.lastName}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {l.constraintChecks ? (
                              <ConstraintSummary checks={l.constraintChecks} />
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`${statusConf.bg} ${statusConf.text} hover:${statusConf.bg}`}>
                              {statusConf.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {l.status === "CLAIMED" ? (
                              <div className="flex gap-1 justify-center">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                                  disabled={actionLoading === l.id}
                                  onClick={() => handleMarketAction(l.id, "manager_approve")}
                                >
                                  Valider
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7 text-red-600 border-red-200"
                                  disabled={actionLoading === l.id}
                                  onClick={() => handleMarketAction(l.id, "manager_reject")}
                                >
                                  Refuser
                                </Button>
                              </div>
                            ) : (
                              <button
                                className="text-xs text-blue-600 hover:text-blue-800"
                                onClick={() => setSelectedListing(l)}
                              >
                                Voir
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
        </>
      )}

      {/* ─── Exchanges Tab ─── */}
      {tab === "exchanges" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select
              value={exchangeStatus}
              onChange={(e) => setExchangeStatus(e.target.value)}
              options={[
                { value: "PENDING_MANAGER", label: "À valider" },
                { value: "PENDING_PEER", label: "Attente collègue" },
                { value: "APPROVED", label: "Approuvés" },
                { value: "ALL", label: "Tous" },
              ]}
              className="w-full sm:w-48"
            />
          </div>

          {exchangeLoading ? (
            <Spinner />
          ) : exchanges.length === 0 ? (
            <EmptyState text="Aucun échange" />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 lg:hidden">
                {exchanges.map((ex) => (
                  <ExchangeMobileCard
                    key={ex.id}
                    exchange={ex}
                    actionLoading={actionLoading}
                    onApprove={() => handleExchangeAction(ex.id, "manager_approve")}
                    onReject={() => handleExchangeAction(ex.id, "manager_reject")}
                  />
                ))}
              </div>

              {/* Desktop table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Shift A</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Initiateur</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">↔</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Shift B</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Cible</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchanges.map((ex) => {
                      const statusConf = EXCHANGE_STATUS[ex.status] || EXCHANGE_STATUS.PENDING_PEER;
                      return (
                        <tr key={ex.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {ex.requesterShift ? (
                              <>
                                <p className="font-medium">{formatDateShort(ex.requesterShift.date)}</p>
                                <p className="text-xs text-gray-500">
                                  {ex.requesterShift.startTime}-{ex.requesterShift.endTime} · {ex.requesterShift.store.name}
                                </p>
                              </>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {ex.requester ? `${ex.requester.firstName} ${ex.requester.lastName}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ArrowLeftRight className="h-4 w-4 text-gray-400 mx-auto" />
                          </td>
                          <td className="px-4 py-3">
                            {ex.targetShift ? (
                              <>
                                <p className="font-medium">{formatDateShort(ex.targetShift.date)}</p>
                                <p className="text-xs text-gray-500">
                                  {ex.targetShift.startTime}-{ex.targetShift.endTime} · {ex.targetShift.store.name}
                                </p>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">Transfert simple</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {ex.target ? `${ex.target.firstName} ${ex.target.lastName}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`${statusConf.bg} ${statusConf.text} hover:${statusConf.bg}`}>
                              {statusConf.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {ex.status === "PENDING_MANAGER" ? (
                              <div className="flex gap-1 justify-center">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs h-7"
                                  disabled={actionLoading === ex.id}
                                  onClick={() => handleExchangeAction(ex.id, "manager_approve")}
                                >
                                  Valider
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7 text-red-600 border-red-200"
                                  disabled={actionLoading === ex.id}
                                  onClick={() => handleExchangeAction(ex.id, "manager_reject")}
                                >
                                  Refuser
                                </Button>
                              </div>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Market Listing Detail Dialog */}
      <Dialog
        open={!!selectedListing}
        onOpenChange={(open) => { if (!open) setSelectedListing(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Détail du listing</DialogTitle>
            <DialogDescription>
              {selectedListing?.store?.name} ·{" "}
              {selectedListing?.shift && formatDateShort(selectedListing.shift.date)}{" "}
              {selectedListing?.shift?.startTime}-{selectedListing?.shift?.endTime}
            </DialogDescription>
          </DialogHeader>

          {selectedListing && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Posteur :</span>
                  <span className="font-medium">
                    {selectedListing.poster
                      ? `${selectedListing.poster.firstName} ${selectedListing.poster.lastName}`
                      : "—"}
                  </span>
                </div>
                {selectedListing.posterMessage && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Message :</span>
                    <span className="italic text-gray-600">{selectedListing.posterMessage}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Réclamant :</span>
                  <span className="font-medium">
                    {selectedListing.claimant
                      ? `${selectedListing.claimant.firstName} ${selectedListing.claimant.lastName}`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Statut :</span>
                  <Badge
                    className={`${MARKET_STATUS[selectedListing.status]?.bg} ${MARKET_STATUS[selectedListing.status]?.text}`}
                  >
                    {MARKET_STATUS[selectedListing.status]?.label}
                  </Badge>
                </div>
              </div>

              {selectedListing.constraintChecks && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Vérification des contraintes
                  </h3>
                  <div className="space-y-1.5">
                    <ConstraintRow ok={selectedListing.constraintChecks.overlapOk} label="Pas de conflit de shift" />
                    <ConstraintRow ok={selectedListing.constraintChecks.weeklyHoursOk} label="Heures hebdomadaires respectées" />
                    <ConstraintRow ok={selectedListing.constraintChecks.dailyHoursOk} label="Heures quotidiennes respectées" />
                    <ConstraintRow ok={selectedListing.constraintChecks.restOk} label="Repos minimum 11h" />
                    <ConstraintRow ok={selectedListing.constraintChecks.availabilityOk} label="Disponibilité confirmée" />
                  </div>
                </div>
              )}

              {selectedListing.status === "CLAIMED" && (
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    disabled={actionLoading === selectedListing.id}
                    onClick={() => handleMarketAction(selectedListing.id, "manager_approve")}
                  >
                    Valider le transfert
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                    disabled={actionLoading === selectedListing.id}
                    onClick={() => handleMarketAction(selectedListing.id, "manager_reject")}
                  >
                    Refuser
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────

function MarketMobileCard({
  listing,
  actionLoading,
  onApprove,
  onReject,
  onDetail,
}: {
  listing: MarketListing;
  actionLoading: string | null;
  onApprove: () => void;
  onReject: () => void;
  onDetail: () => void;
}) {
  const statusConf = MARKET_STATUS[listing.status] || MARKET_STATUS.OPEN;
  const isLoading = actionLoading === listing.id;

  return (
    <button
      onClick={onDetail}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 space-y-2 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          {listing.shift && (
            <>
              <p className="text-sm font-medium text-gray-900">
                {formatDateShort(listing.shift.date)} · {listing.shift.startTime}-{listing.shift.endTime}
              </p>
            </>
          )}
          <p className="text-xs text-gray-500">{listing.store?.name}</p>
        </div>
        <Badge className={`${statusConf.bg} ${statusConf.text} text-[10px]`}>
          {statusConf.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span>Posteur : {listing.poster ? `${listing.poster.firstName} ${listing.poster.lastName}` : "—"}</span>
        {listing.claimant && (
          <span>→ {listing.claimant.firstName} {listing.claimant.lastName}</span>
        )}
      </div>

      {listing.constraintChecks && (
        <ConstraintSummary checks={listing.constraintChecks} />
      )}

      {listing.status === "CLAIMED" && (
        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white text-xs h-7 flex-1"
            disabled={isLoading}
            onClick={onApprove}
          >
            Valider
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 text-red-600 border-red-200 flex-1"
            disabled={isLoading}
            onClick={onReject}
          >
            Refuser
          </Button>
        </div>
      )}
    </button>
  );
}

function ExchangeMobileCard({
  exchange,
  actionLoading,
  onApprove,
  onReject,
}: {
  exchange: ShiftExchange;
  actionLoading: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const statusConf = EXCHANGE_STATUS[exchange.status] || EXCHANGE_STATUS.PENDING_PEER;
  const isLoading = actionLoading === exchange.id;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          {exchange.requesterShift && (
            <p className="text-sm font-medium text-gray-900">
              {formatDateShort(exchange.requesterShift.date)} · {exchange.requesterShift.startTime}-{exchange.requesterShift.endTime}
            </p>
          )}
          <p className="text-xs text-gray-500">
            {exchange.requesterShift?.store.name}
          </p>
        </div>
        <Badge className={`${statusConf.bg} ${statusConf.text} text-[10px]`}>
          {statusConf.label}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-600">
        <span>{exchange.requester ? `${exchange.requester.firstName} ${exchange.requester.lastName}` : "—"}</span>
        <ArrowLeftRight className="h-3 w-3 text-gray-400" />
        <span>{exchange.target ? `${exchange.target.firstName} ${exchange.target.lastName}` : "—"}</span>
      </div>

      {exchange.message && (
        <p className="text-xs text-gray-500 italic">&ldquo;{exchange.message}&rdquo;</p>
      )}

      {exchange.status === "PENDING_MANAGER" && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white text-xs h-7 flex-1"
            disabled={isLoading}
            onClick={onApprove}
          >
            Valider
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 text-red-600 border-red-200 flex-1"
            disabled={isLoading}
            onClick={onReject}
          >
            Refuser
          </Button>
        </div>
      )}
    </div>
  );
}

function ConstraintSummary({ checks }: { checks: ConstraintChecks }) {
  const all = [checks.overlapOk, checks.weeklyHoursOk, checks.dailyHoursOk, checks.restOk, checks.availabilityOk];
  const passed = all.filter(Boolean).length;
  const allOk = passed === all.length;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${allOk ? "text-green-600" : "text-red-600"}`}>
      {allOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {passed}/{all.length} OK
    </span>
  );
}

function ConstraintRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${ok ? "text-green-700" : "text-red-600"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {label}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
      {text}
    </div>
  );
}

function formatDateShort(isoStr: string): string {
  const d = new Date(isoStr.includes("T") ? isoStr : isoStr + "T00:00:00Z");
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
