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
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Clock, X, MapPin } from "lucide-react";

// Day names in French, indexed 0=Dim ... 6=Sam
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_FULL_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Reorder for display: Mon-Sun (1,2,3,4,5,6,0)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface DaySchedule {
  dayOfWeek: number;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  maxSimultaneous: number | null;
}

interface StoreSchedule {
  id: string;
  storeId: string;
  dayOfWeek: number;
  closed: boolean;
  openTime: string | null;
  closeTime: string | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  maxSimultaneous: number | null;
}

interface Store {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  needsManager: boolean;
  allowOverlap: boolean;
  maxOverlapMinutes: number;
  maxSimultaneous: number;
  schedules: StoreSchedule[];
  _count: { employees: number; shifts: number };
}

function getDefaultSchedules(): DaySchedule[] {
  return DAY_ORDER.map((day) => ({
    dayOfWeek: day,
    closed: false, // Tous les jours ouverts par défaut — l'admin choisit de fermer
    openTime: "09:00",
    closeTime: "20:00",
    minEmployees: null,
    maxEmployees: null,
    maxSimultaneous: null,
  }));
}

function schedulesFromStore(store: Store): DaySchedule[] {
  const defaults = getDefaultSchedules();
  if (!store.schedules || store.schedules.length === 0) return defaults;

  return DAY_ORDER.map((day) => {
    const existing = store.schedules.find((s) => s.dayOfWeek === day);
    if (existing) {
      return {
        dayOfWeek: existing.dayOfWeek,
        closed: existing.closed,
        openTime: existing.openTime || "09:00",
        closeTime: existing.closeTime || "20:00",
        minEmployees: existing.minEmployees,
        maxEmployees: existing.maxEmployees,
        maxSimultaneous: existing.maxSimultaneous,
      };
    }
    return defaults.find((d) => d.dayOfWeek === day)!;
  });
}

// Summarize schedule for display (e.g. "Lun-Ven 09:00-20:00")
function summarizeSchedule(schedules: StoreSchedule[]): string {
  if (!schedules || schedules.length === 0) return "Non configuré";

  const open = schedules.filter((s) => !s.closed).sort((a, b) => {
    const orderA = DAY_ORDER.indexOf(a.dayOfWeek);
    const orderB = DAY_ORDER.indexOf(b.dayOfWeek);
    return orderA - orderB;
  });

  if (open.length === 0) return "Fermé";

  // Group consecutive days with same hours
  const groups: { days: number[]; open: string; close: string }[] = [];
  for (const s of open) {
    const last = groups[groups.length - 1];
    const time = `${s.openTime || "09:00"}-${s.closeTime || "20:00"}`;
    if (last && `${last.open}-${last.close}` === time) {
      last.days.push(s.dayOfWeek);
    } else {
      groups.push({
        days: [s.dayOfWeek],
        open: s.openTime || "09:00",
        close: s.closeTime || "20:00",
      });
    }
  }

  return groups
    .map((g) => {
      const dayStr =
        g.days.length === 1
          ? DAY_NAMES[g.days[0]]
          : `${DAY_NAMES[g.days[0]]}-${DAY_NAMES[g.days[g.days.length - 1]]}`;
      return `${dayStr} ${g.open}-${g.close}`;
    })
    .join(", ");
}

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [form, setForm] = useState({
    name: "",
    city: "",
    address: "",
    timezone: "Europe/Paris",
    latitude: "",
    longitude: "",
    minEmployees: "1",
    maxEmployees: "",
    needsManager: false,
    allowOverlap: false,
    maxOverlapMinutes: "0",
    maxSimultaneous: "1",
  });
  const [schedules, setSchedules] = useState<DaySchedule[]>(getDefaultSchedules());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/stores?page=${page}&limit=20&search=${encodeURIComponent(search)}`
      );
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
        setTotalPages(data.pagination?.totalPages || 1);
      }
    } catch {
      console.error("Erreur chargement magasins");
    }
  }, [page, search]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      city: "",
      address: "",
      timezone: "Europe/Paris",
      latitude: "",
      longitude: "",
      minEmployees: "1",
      maxEmployees: "",
      needsManager: false,
      allowOverlap: false,
      maxOverlapMinutes: "0",
      maxSimultaneous: "1",
    });
    setSchedules(getDefaultSchedules());
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
      latitude: store.latitude?.toString() || "",
      longitude: store.longitude?.toString() || "",
      minEmployees: store.minEmployees?.toString() || "1",
      maxEmployees: store.maxEmployees?.toString() || "",
      needsManager: store.needsManager || false,
      allowOverlap: store.allowOverlap || false,
      maxOverlapMinutes: store.maxOverlapMinutes?.toString() || "0",
      maxSimultaneous: store.maxSimultaneous?.toString() || "1",
    });
    setSchedules(schedulesFromStore(store));
    setError("");
    setDialogOpen(true);
  }

  function updateScheduleDay(dayOfWeek: number, field: keyof DaySchedule, value: unknown) {
    setSchedules((prev) =>
      prev.map((s) => (s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s))
    );
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
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      minEmployees: form.minEmployees ? parseInt(form.minEmployees) : null,
      maxEmployees: form.maxEmployees ? parseInt(form.maxEmployees) : null,
      needsManager: form.needsManager,
      allowOverlap: form.allowOverlap,
      maxOverlapMinutes: form.allowOverlap ? parseInt(form.maxOverlapMinutes) : 0,
      maxSimultaneous: parseInt(form.maxSimultaneous) || 1,
    };

    const url = editing ? `/api/stores/${editing.id}` : "/api/stores";
    const method = editing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erreur");
      setLoading(false);
      return;
    }

    const storeData = await res.json();
    const storeId = editing ? editing.id : storeData.id;

    // Save schedules
    const scheduleRes = await fetch(`/api/stores/${storeId}/schedules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedules: schedules.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          closed: s.closed,
          openTime: s.closed ? null : s.openTime,
          closeTime: s.closed ? null : s.closeTime,
          minEmployees: s.minEmployees,
          maxEmployees: s.maxEmployees,
          maxSimultaneous: s.maxSimultaneous,
        })),
      }),
    });

    if (!scheduleRes.ok) {
      const data = await scheduleRes.json();
      setError(data.error || "Erreur lors de la sauvegarde des horaires");
      setLoading(false);
      return;
    }

    setLoading(false);
    setDialogOpen(false);
    loadStores();
  }

  async function handleDelete(store: Store) {
    if (!confirm(`Supprimer le magasin "${store.name}" ? Cette action est irréversible.`))
      return;
    try {
      const res = await fetch(`/api/stores/${store.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      loadStores();
    } catch {
      alert("Erreur réseau");
    }
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
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 lg:hidden">
        {stores.map((store) => (
          <div
            key={store.id}
            className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 truncate">
                    {store.name}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {store._count.employees} emp.
                  </Badge>
                </div>
                {store.city && (
                  <p className="text-xs text-gray-500 mt-0.5">{store.city}</p>
                )}
                {store.address && (
                  <p className="text-xs text-gray-400 truncate">{store.address}</p>
                )}
                <div className="flex items-center gap-1 mt-1.5">
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-[10px] text-gray-500">
                    {summarizeSchedule(store.schedules)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(store)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleDelete(store)}
                >
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
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Horaires</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fuseau</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">
                  Employés
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr
                  key={store.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium">{store.name}</td>
                  <td className="px-4 py-3 text-gray-600">{store.city || "-"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {summarizeSchedule(store.schedules)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{store.timezone}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="secondary">{store._count.employees}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(store)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(store)}
                    >
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
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="mx-2 sm:mx-auto max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier le magasin" : "Nouveau magasin"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifiez les informations du magasin."
                : "Ajoutez un nouveau magasin."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic info */}
            <div className="space-y-2">
              <Label htmlFor="store-name">Nom *</Label>
              <Input
                id="store-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="store-tz">Fuseau horaire</Label>
                <Input
                  id="store-tz"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  placeholder="Europe/Paris"
                />
              </div>
              <div className="space-y-2">
                <Label>Min. employés (défaut)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.minEmployees}
                  onChange={(e) =>
                    setForm({ ...form, minEmployees: e.target.value })
                  }
                  placeholder="1"
                />
              </div>
            </div>
            {/* GPS for clock-in geofencing — auto-capture, not editable */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className={`h-4 w-4 ${form.latitude && form.longitude ? "text-green-600" : "text-gray-400"}`} />
                  <span className="text-sm font-medium text-gray-700">Position GPS (pointage)</span>
                  {form.latitude && form.longitude ? (
                    <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700">
                      Localisé
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-500">
                      Non localisé
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant={form.latitude && form.longitude ? "outline" : "default"}
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      setError("Géolocalisation non supportée par ce navigateur");
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setForm({
                          ...form,
                          latitude: pos.coords.latitude.toFixed(6),
                          longitude: pos.coords.longitude.toFixed(6),
                        });
                      },
                      () => setError("Impossible d'obtenir la position GPS")
                    );
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1" />
                  {form.latitude && form.longitude ? "Relocaliser" : "Localiser le magasin"}
                </Button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 ml-6">
                Rendez-vous au magasin et cliquez sur le bouton pour enregistrer la position.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="needs-manager"
                checked={form.needsManager}
                onChange={(e) =>
                  setForm({ ...form, needsManager: e.target.checked })
                }
                className="rounded"
              />
              <Label htmlFor="needs-manager" className="cursor-pointer">
                Manager obligatoire sur chaque créneau
              </Label>
            </div>

            {/* Overlap settings */}
            <div className="border-t border-gray-200 pt-4">
              <span className="text-sm font-semibold text-gray-700 mb-3 block">
                Chevauchement entre employes
              </span>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="allow-overlap"
                    checked={form.allowOverlap}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        allowOverlap: e.target.checked,
                        maxOverlapMinutes: e.target.checked ? form.maxOverlapMinutes : "0",
                      })
                    }
                    className="rounded"
                  />
                  <Label htmlFor="allow-overlap" className="cursor-pointer">
                    Autoriser le chevauchement entre employes
                  </Label>
                </div>
                <div className="flex items-center gap-2 ml-6">
                  <Label
                    htmlFor="max-overlap"
                    className={`text-xs ${form.allowOverlap ? "text-gray-700" : "text-gray-400"}`}
                  >
                    Duree maximale :
                  </Label>
                  <select
                    id="max-overlap"
                    value={form.maxOverlapMinutes}
                    onChange={(e) =>
                      setForm({ ...form, maxOverlapMinutes: e.target.value })
                    }
                    disabled={!form.allowOverlap}
                    className={`h-8 px-2 text-xs border border-gray-300 rounded-md ${
                      form.allowOverlap ? "bg-white text-gray-900" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    <option value="0">0 min</option>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
                <p className="text-[10px] text-gray-400 ml-6">
                  Si desactive, seul un relais exact est autorise (ex: A 10h-15h, B 15h-20h).
                </p>
              </div>
            </div>

            {/* Personnel limits */}
            <div className="border-t border-gray-200 pt-4">
              <span className="text-sm font-semibold text-gray-700 mb-3 block">
                Limites de personnel
              </span>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="max-simultaneous" className="text-xs">
                    Employes simultanes max
                  </Label>
                  <select
                    id="max-simultaneous"
                    value={form.maxSimultaneous}
                    onChange={(e) => setForm({ ...form, maxSimultaneous: e.target.value })}
                    className="h-8 w-full px-2 text-xs border border-gray-300 rounded-md bg-white"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n.toString()}>{n}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400">
                    Nombre max d&apos;employes presents en meme temps.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="max-employees-day" className="text-xs">
                    Employes max par jour
                  </Label>
                  <Input
                    id="max-employees-day"
                    type="number"
                    min="0"
                    value={form.maxEmployees}
                    onChange={(e) => setForm({ ...form, maxEmployees: e.target.value })}
                    placeholder="Illimite"
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-gray-400">
                    Nombre max d&apos;employes differents dans la journee.
                  </p>
                </div>
              </div>
            </div>

            {/* Day-by-day schedule */}
            <div className="border-t border-gray-200 pt-4">
              <span className="text-sm font-semibold text-gray-700 mb-3 block">
                📅 Horaires par jour
              </span>

              <div className="space-y-2">
                {schedules.map((day) => (
                  <div
                    key={day.dayOfWeek}
                    className={`flex items-center gap-2 sm:gap-3 p-2 rounded-lg border ${
                      day.closed
                        ? "bg-gray-50 border-gray-200"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    {/* Day name */}
                    <span
                      className={`text-xs font-semibold w-8 sm:w-10 shrink-0 ${
                        day.closed ? "text-gray-400" : "text-gray-700"
                      }`}
                    >
                      {DAY_NAMES[day.dayOfWeek]}
                    </span>

                    {/* Closed toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        updateScheduleDay(day.dayOfWeek, "closed", !day.closed)
                      }
                      className={`text-[10px] sm:text-xs px-2 py-1 rounded-full font-medium shrink-0 transition-colors ${
                        day.closed
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                    >
                      {day.closed ? "Fermé" : "Ouvert"}
                    </button>

                    {/* Time inputs */}
                    {!day.closed && (
                      <>
                        <Input
                          type="time"
                          value={day.openTime || "09:00"}
                          onChange={(e) =>
                            updateScheduleDay(
                              day.dayOfWeek,
                              "openTime",
                              e.target.value
                            )
                          }
                          className="w-24 sm:w-28 h-8 text-xs"
                        />
                        <span className="text-gray-400 text-xs">→</span>
                        <Input
                          type="time"
                          value={day.closeTime || "20:00"}
                          onChange={(e) =>
                            updateScheduleDay(
                              day.dayOfWeek,
                              "closeTime",
                              e.target.value
                            )
                          }
                          className="w-24 sm:w-28 h-8 text-xs"
                        />

                        {/* Optional min/max employees override */}
                        <div className="hidden sm:flex items-center gap-1 ml-auto">
                          <span className="text-[10px] text-gray-400">Min:</span>
                          <Input
                            type="number"
                            min="0"
                            value={day.minEmployees ?? ""}
                            onChange={(e) =>
                              updateScheduleDay(
                                day.dayOfWeek,
                                "minEmployees",
                                e.target.value ? parseInt(e.target.value) : null
                              )
                            }
                            placeholder="-"
                            className="w-14 h-8 text-xs text-center"
                          />
                          <span className="text-[10px] text-gray-400">Max:</span>
                          <Input
                            type="number"
                            min="0"
                            value={day.maxEmployees ?? ""}
                            onChange={(e) =>
                              updateScheduleDay(
                                day.dayOfWeek,
                                "maxEmployees",
                                e.target.value ? parseInt(e.target.value) : null
                              )
                            }
                            placeholder="-"
                            className="w-14 h-8 text-xs text-center"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-gray-400 mt-2">
                💡 Min/Max par jour surchargent les valeurs par défaut. Laissez vide pour utiliser le défaut.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
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
