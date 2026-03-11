"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
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
  Megaphone,
  Plus,
  Trash2,
  Globe,
  MapPin,
  Loader2,
  Send,
} from "lucide-react";

interface Store {
  id: string;
  name: string;
}

interface BroadcastStore {
  store: { id: string; name: string };
}

interface Broadcast {
  id: string;
  title: string;
  body: string;
  scope: "ALL" | "SELECTED";
  createdAt: string;
  author: { id: string; name: string };
  stores: BroadcastStore[];
}

export default function AnnoncesPage() {
  const { data: session } = useSession();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const userRole = (session?.user as any)?.role;
  const isManager = userRole === "ADMIN" || userRole === "MANAGER";

  // Create form
  const [form, setForm] = useState({
    title: "",
    body: "",
    scope: "ALL" as "ALL" | "SELECTED",
    storeIds: [] as string[],
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const loadBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/broadcasts");
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(data.broadcasts);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch("/api/stores");
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadBroadcasts();
    loadStores();
  }, [loadBroadcasts, loadStores]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreateLoading(true);

    try {
      const res = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Erreur");
        setCreateLoading(false);
        return;
      }

      setCreateOpen(false);
      setForm({ title: "", body: "", scope: "ALL", storeIds: [] });
      loadBroadcasts();
    } catch {
      setCreateError("Erreur réseau");
    }
    setCreateLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette annonce ?")) return;
    try {
      await fetch(`/api/broadcasts/${id}`, { method: "DELETE" });
      setBroadcasts((prev) => prev.filter((b) => b.id !== id));
    } catch {
      // silent
    }
  }

  function toggleStore(storeId: string) {
    setForm((prev) => ({
      ...prev,
      storeIds: prev.storeIds.includes(storeId)
        ? prev.storeIds.filter((id) => id !== storeId)
        : [...prev.storeIds, storeId],
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Annonces</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Diffusez des informations aux collaborateurs
          </p>
        </div>
        {isManager && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle annonce
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : broadcasts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Megaphone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Aucune annonce</p>
          <p className="text-sm text-gray-400 mb-4">
            Créez une annonce pour informer vos collaborateurs
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Créer une annonce
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {broadcasts.map((b) => (
            <div
              key={b.id}
              className="bg-white border border-gray-200 rounded-lg p-5"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-bold text-gray-900">{b.title}</h2>
                    {b.scope === "ALL" ? (
                      <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0 flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        Tous les magasins
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-green-100 text-green-700 border-0 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {b.stores.map((s) => s.store.name).join(", ")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Par {b.author.name}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(b.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
                {isManager && (
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{b.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle annonce</DialogTitle>
            <DialogDescription>
              Diffusez une information aux collaborateurs
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Titre *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Nouvelles consignes hygiène"
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>Contenu *</Label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Rédigez votre annonce..."
                className="w-full h-32 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
                required
                maxLength={10000}
              />
            </div>

            <div className="space-y-2">
              <Label>Destinataires</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, scope: "ALL", storeIds: [] })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.scope === "ALL"
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <Globe className="h-4 w-4" />
                  Tous les magasins
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, scope: "SELECTED" })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.scope === "SELECTED"
                      ? "bg-green-50 border-green-300 text-green-700"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <MapPin className="h-4 w-4" />
                  Magasins spécifiques
                </button>
              </div>

              {form.scope === "SELECTED" && (
                <div className="mt-2 border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  {stores.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucun magasin disponible</p>
                  ) : (
                    stores.map((store) => (
                      <label
                        key={store.id}
                        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.storeIds.includes(store.id)}
                          onChange={() => toggleStore(store.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{store.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Publier
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
