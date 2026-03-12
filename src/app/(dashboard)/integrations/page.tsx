"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus,
  Plug,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  Zap,
  Clock,
  Users,
  Store,
  ShoppingCart,
  Check,
  AlertTriangle,
  Loader2,
  Link2,
  Unlink,
} from "lucide-react";

interface SyncLog {
  id: string;
  direction: string;
  status: string;
  entityType: string;
  totalRecords: number;
  created: number;
  failed: number;
  durationMs: number | null;
  startedAt: string;
}

interface Provider {
  id: string;
  name: string;
  type: string;
  active: boolean;
  apiUrl: string | null;
  syncEmployees: boolean;
  syncTimeClock: boolean;
  syncSales: boolean;
  syncInterval: number;
  lastSyncAt: string | null;
  notes: string | null;
  storeLinks: { id: string; storeId: string; posStoreId: string; posStoreName: string | null; active: boolean }[];
  employeeLinks: { id: string; employeeId: string; posEmployeeId: string; posEmployeeName: string | null; active: boolean }[];
  syncLogs: SyncLog[];
  _count: { storeLinks: number; employeeLinks: number; timeClocks: number; salesData: number };
}

interface StoreOption {
  id: string;
  name: string;
  city: string | null;
}

const POS_TYPES: Record<string, { label: string; color: string }> = {
  LIGHTSPEED: { label: "Lightspeed", color: "bg-green-100 text-green-700" },
  SQUARE: { label: "Square", color: "bg-blue-100 text-blue-700" },
  ZELTY: { label: "Zelty", color: "bg-orange-100 text-orange-700" },
  SUMUP: { label: "SumUp", color: "bg-purple-100 text-purple-700" },
  CUSTOM_API: { label: "API Custom", color: "bg-gray-100 text-gray-700" },
};

const SYNC_STATUS_ICONS: Record<string, { icon: typeof Check; color: string }> = {
  SUCCESS: { icon: Check, color: "text-green-500" },
  PARTIAL: { icon: AlertTriangle, color: "text-amber-500" },
  FAILED: { icon: AlertTriangle, color: "text-red-500" },
  RUNNING: { icon: Loader2, color: "text-blue-500" },
};

export default function IntegrationsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkProviderId, setLinkProviderId] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { connected: boolean; posStores?: { posId: string; name: string }[]; loading: boolean }>>({});
  const [syncLoading, setSyncLoading] = useState<Record<string, boolean>>({});

  // Create form
  const [form, setForm] = useState({
    name: "",
    type: "CUSTOM_API",
    apiUrl: "",
    apiKey: "",
    apiSecret: "",
    syncEmployees: true,
    syncTimeClock: true,
    syncSales: false,
    syncInterval: 60,
    notes: "",
  });
  const [createError, setCreateError] = useState("");

  // Link form
  const [linkForm, setLinkForm] = useState({
    storeId: "",
    posStoreId: "",
    posStoreName: "",
  });

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/integrations/pos");
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers);
    }
  }, []);

  useEffect(() => {
    loadProviders();
    fetch("/api/stores?limit=100")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setStores(d.stores || []))
      .catch(() => {});
  }, [loadProviders]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");

    const res = await fetch("/api/integrations/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        apiUrl: form.apiUrl || null,
        apiKey: form.apiKey || null,
        apiSecret: form.apiSecret || null,
        notes: form.notes || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setCreateError(data.error || "Erreur");
      return;
    }

    setCreateOpen(false);
    setForm({ name: "", type: "CUSTOM_API", apiUrl: "", apiKey: "", apiSecret: "", syncEmployees: true, syncTimeClock: true, syncSales: false, syncInterval: 60, notes: "" });
    loadProviders();
  }

  async function testConnection(providerId: string) {
    setTestResults((prev) => ({ ...prev, [providerId]: { connected: false, loading: true } }));

    try {
      const res = await fetch(`/api/integrations/pos/${providerId}/test`, { method: "POST" });
      const data = await res.json();

      setTestResults((prev) => ({
        ...prev,
        [providerId]: { connected: data.connected, posStores: data.posStores, loading: false },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { connected: false, loading: false },
      }));
    }
  }

  async function runSync(providerId: string, entity: string) {
    const key = `${providerId}-${entity}`;
    setSyncLoading((prev) => ({ ...prev, [key]: true }));

    await fetch(`/api/integrations/pos/${providerId}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity }),
    });

    setSyncLoading((prev) => ({ ...prev, [key]: false }));
    loadProviders();
  }

  async function deleteProvider(provider: Provider) {
    if (!confirm(`Supprimer l'intégration "${provider.name}" et toutes ses données associées ?`)) return;
    await fetch(`/api/integrations/pos/${provider.id}`, { method: "DELETE" });
    loadProviders();
  }

  async function toggleProvider(provider: Provider) {
    await fetch(`/api/integrations/pos/${provider.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !provider.active }),
    });
    loadProviders();
  }

  function openLinkDialog(providerId: string) {
    setLinkProviderId(providerId);
    setLinkForm({ storeId: "", posStoreId: "", posStoreName: "" });
    setLinkOpen(true);
  }

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/integrations/pos/${linkProviderId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "store",
        ...linkForm,
        posStoreName: linkForm.posStoreName || null,
      }),
    });
    setLinkOpen(false);
    loadProviders();
  }

  async function deleteLink(providerId: string, linkId: string, type: string) {
    await fetch(`/api/integrations/pos/${providerId}/links?linkId=${linkId}&type=${type}`, {
      method: "DELETE",
    });
    loadProviders();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intégrations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pont TimeWin ↔ Caisse POS
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau POS
        </Button>
      </div>

      {/* Providers list */}
      <div className="space-y-4">
        {providers.map((provider) => {
          const typeInfo = POS_TYPES[provider.type] || POS_TYPES.CUSTOM_API;
          const test = testResults[provider.id];

          return (
            <div
              key={provider.id}
              className={`bg-white border rounded-lg overflow-hidden ${
                !provider.active ? "opacity-60 border-gray-200" : "border-gray-200"
              }`}
            >
              {/* Header */}
              <div className="p-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Plug className="h-5 w-5 text-gray-400" />
                    <span className="text-lg font-semibold text-gray-900">{provider.name}</span>
                    <Badge variant="outline" className={`text-xs ${typeInfo.color}`}>
                      {typeInfo.label}
                    </Badge>
                    {!provider.active && (
                      <Badge variant="secondary" className="text-xs">Désactivé</Badge>
                    )}
                  </div>
                  {provider.apiUrl && (
                    <p className="text-xs text-gray-400 mt-1 font-mono">{provider.apiUrl}</p>
                  )}
                  {provider.notes && (
                    <p className="text-xs text-gray-500 mt-1">{provider.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(provider.id)}
                    disabled={test?.loading}
                  >
                    {test?.loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : test?.connected ? (
                      <Wifi className="h-3.5 w-3.5 text-green-500" />
                    ) : test && !test.connected ? (
                      <WifiOff className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Wifi className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">Tester</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleProvider(provider)}
                  >
                    {provider.active ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => deleteProvider(provider)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>

              {/* Stats bar */}
              <div className="px-4 pb-3 flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1 text-gray-500">
                  <Store className="h-3 w-3" />
                  <span>{provider._count.storeLinks} magasin(s) liés</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <Users className="h-3 w-3" />
                  <span>{provider._count.employeeLinks} employé(s) liés</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{provider._count.timeClocks} pointage(s)</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <ShoppingCart className="h-3 w-3" />
                  <span>{provider._count.salesData} vente(s)</span>
                </div>
                {provider.lastSyncAt && (
                  <div className="flex items-center gap-1 text-gray-400">
                    <RefreshCw className="h-3 w-3" />
                    <span>
                      Dernière sync:{" "}
                      {new Date(provider.lastSyncAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Store links */}
              {provider.storeLinks.length > 0 && (
                <div className="px-4 pb-3">
                  <p className="text-[10px] uppercase text-gray-400 font-medium mb-1">
                    Magasins liés
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.storeLinks.map((link) => {
                      const twStore = stores.find((s) => s.id === link.storeId);
                      return (
                        <div
                          key={link.id}
                          className="flex items-center gap-1 bg-gray-50 rounded px-2 py-1 text-xs"
                        >
                          <Link2 className="h-3 w-3 text-gray-400" />
                          <span className="font-medium">{twStore?.name || link.storeId}</span>
                          <span className="text-gray-400">↔</span>
                          <span className="font-mono text-gray-500">{link.posStoreId}</span>
                          <button
                            onClick={() => deleteLink(provider.id, link.id, "store")}
                            className="ml-1 text-gray-300 hover:text-red-500"
                          >
                            <Unlink className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sync actions */}
              <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => openLinkDialog(provider.id)}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Lier un magasin
                </Button>

                {provider.syncEmployees && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={!!syncLoading[`${provider.id}-employees`]}
                    onClick={() => runSync(provider.id, "employees")}
                  >
                    {syncLoading[`${provider.id}-employees`] ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Users className="h-3 w-3 mr-1" />
                    )}
                    Sync Employés
                  </Button>
                )}

                {provider.syncTimeClock && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={!!syncLoading[`${provider.id}-timeclock`]}
                    onClick={() => runSync(provider.id, "timeclock")}
                  >
                    {syncLoading[`${provider.id}-timeclock`] ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Clock className="h-3 w-3 mr-1" />
                    )}
                    Sync Pointages
                  </Button>
                )}

                {provider.syncSales && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={!!syncLoading[`${provider.id}-sales`]}
                    onClick={() => runSync(provider.id, "sales")}
                  >
                    {syncLoading[`${provider.id}-sales`] ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <ShoppingCart className="h-3 w-3 mr-1" />
                    )}
                    Sync Ventes
                  </Button>
                )}
              </div>

              {/* Recent sync logs */}
              {provider.syncLogs.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-2">
                  <p className="text-[10px] uppercase text-gray-400 font-medium mb-1">
                    Dernières synchros
                  </p>
                  <div className="space-y-1">
                    {provider.syncLogs.map((log) => {
                      const statusInfo = SYNC_STATUS_ICONS[log.status];
                      const Icon = statusInfo?.icon || AlertTriangle;

                      return (
                        <div
                          key={log.id}
                          className="flex items-center justify-between text-xs py-0.5"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={`h-3 w-3 ${statusInfo?.color || "text-gray-400"}`} />
                            <span className="text-gray-600">{log.entityType}</span>
                            <span className="text-gray-400">{log.direction}</span>
                          </div>
                          <div className="flex items-center gap-3 text-gray-400">
                            <span>
                              {log.created > 0 && <span className="text-green-600">+{log.created}</span>}
                              {log.failed > 0 && <span className="text-red-500 ml-1">✗{log.failed}</span>}
                              {log.created === 0 && log.failed === 0 && `${log.totalRecords} rec.`}
                            </span>
                            {log.durationMs && <span>{log.durationMs}ms</span>}
                            <span>
                              {new Date(log.startedAt).toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {providers.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Plug className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">Aucune intégration POS configurée</p>
            <p className="text-sm text-gray-400 mb-4">
              Connectez votre caisse pour synchroniser employés, pointages et ventes
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un POS
            </Button>
          </div>
        )}
      </div>

      {/* Create provider dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Nouvelle intégration POS</DialogTitle>
            <DialogDescription>
              Configurez la connexion vers votre logiciel de caisse
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Nom de l&apos;intégration *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Lightspeed - The Wesley"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Type de POS *</Label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                {Object.entries(POS_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>URL API</Label>
              <Input
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                placeholder="https://api.lightspeed.com/v1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Clé API</Label>
                <Input
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="Clé ou Client ID"
                />
              </div>
              <div className="space-y-2">
                <Label>Secret API</Label>
                <Input
                  type="password"
                  value={form.apiSecret}
                  onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                  placeholder="Secret"
                />
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">
                <Zap className="h-4 w-4 inline mr-1" />
                Données à synchroniser
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.syncEmployees}
                    onChange={(e) => setForm({ ...form, syncEmployees: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Employés (TimeWin → POS)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.syncTimeClock}
                    onChange={(e) => setForm({ ...form, syncTimeClock: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Pointages (POS → TimeWin)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.syncSales}
                    onChange={(e) => setForm({ ...form, syncSales: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Ventes / CA (POS → TimeWin)</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Intervalle de sync auto (minutes)</Label>
              <Input
                type="number"
                min="0"
                max="1440"
                value={form.syncInterval}
                onChange={(e) => setForm({ ...form, syncInterval: parseInt(e.target.value) || 0 })}
              />
              <p className="text-[10px] text-gray-400">0 = synchronisation manuelle uniquement</p>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes internes..."
              />
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">Créer l&apos;intégration</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link store dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lier un magasin</DialogTitle>
            <DialogDescription>
              Associez un magasin TimeWin à son identifiant côté POS
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateLink} className="space-y-4">
            <div className="space-y-2">
              <Label>Magasin TimeWin *</Label>
              <select
                value={linkForm.storeId}
                onChange={(e) => setLinkForm({ ...linkForm, storeId: e.target.value })}
                className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                required
              >
                <option value="">Sélectionner...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.city ? `(${s.city})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>ID magasin côté POS *</Label>
              <Input
                value={linkForm.posStoreId}
                onChange={(e) => setLinkForm({ ...linkForm, posStoreId: e.target.value })}
                placeholder="Ex: POS-STORE-001 ou 12345"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Nom côté POS (optionnel)</Label>
              <Input
                value={linkForm.posStoreName}
                onChange={(e) => setLinkForm({ ...linkForm, posStoreName: e.target.value })}
                placeholder="Nom affiché dans le POS"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">Lier</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
