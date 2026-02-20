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
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";

interface Store {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  timezone: string | null;
  _count: { employees: number; shifts: number };
}

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [form, setForm] = useState({ name: "", city: "", address: "", timezone: "Europe/Paris" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadStores = useCallback(async () => {
    const res = await fetch(
      `/api/stores?page=${page}&limit=20&search=${encodeURIComponent(search)}`
    );
    if (res.ok) {
      const data = await res.json();
      setStores(data.stores);
      setTotalPages(data.pagination.totalPages);
    }
  }, [page, search]);

  useEffect(() => { loadStores(); }, [loadStores]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", city: "", address: "", timezone: "Europe/Paris" });
    setError("");
    setDialogOpen(true);
  }

  function openEdit(store: Store) {
    setEditing(store);
    setForm({
      name: store.name,
      city: store.city || "",
      address: store.address || "",
      timezone: store.timezone || "Europe/Paris",
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      name: form.name,
      city: form.city || null,
      address: form.address || null,
      timezone: form.timezone || null,
    };

    const url = editing ? `/api/stores/${editing.id}` : "/api/stores";
    const method = editing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erreur");
      return;
    }

    setDialogOpen(false);
    loadStores();
  }

  async function handleDelete(store: Store) {
    if (!confirm(`Supprimer le magasin "${store.name}" ? Cette action est irréversible.`)) return;
    await fetch(`/api/stores/${store.id}`, { method: "DELETE" });
    loadStores();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Magasins</h1>
        <Button size="sm" className="sm:size-default" onClick={openCreate}>
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Nouveau magasin</span>
        </Button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 lg:hidden">
        {stores.map((store) => (
          <div key={store.id} className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 truncate">{store.name}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{store._count.employees} emp.</Badge>
                </div>
                {store.city && <p className="text-xs text-gray-500 mt-0.5">{store.city}</p>}
                {store.address && <p className="text-xs text-gray-400 truncate">{store.address}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(store)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(store)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {stores.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            Aucun magasin trouvé
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Desktop table layout */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ville</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Adresse</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fuseau</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Employés</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{store.name}</td>
                  <td className="px-4 py-3 text-gray-600">{store.city || "-"}</td>
                  <td className="px-4 py-3 text-gray-600">{store.address || "-"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{store.timezone}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="secondary">{store._count.employees}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(store)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(store)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
              {stores.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Aucun magasin trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier le magasin" : "Nouveau magasin"}
            </DialogTitle>
            <DialogDescription>
              {editing ? "Modifiez les informations du magasin." : "Ajoutez un nouveau magasin."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Nom *</Label>
              <Input
                id="store-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-city">Ville</Label>
              <Input
                id="store-city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-address">Adresse</Label>
              <Input
                id="store-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-tz">Fuseau horaire</Label>
              <Input
                id="store-tz"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                placeholder="Europe/Paris"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "..." : editing ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
