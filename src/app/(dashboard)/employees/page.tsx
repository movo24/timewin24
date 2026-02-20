"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Euro,
} from "lucide-react";

interface StoreAssignment {
  store: { id: string; name: string };
}

interface CostCountry {
  code: string;
  name: string;
  employerRate: number;
  minimumWageHour: number;
  reductionEnabled: boolean;
  reductionMaxCoeff: number;
  reductionThreshold: number;
}

interface CostConfig {
  id: string;
  hourlyRateGross: number;
  fixedMissionCost: number | null;
  employerRateOverride: number | null;
  extraHourlyCostOverride: number | null;
  countryCode: string;
  country: CostCountry;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
  weeklyHours: number | null;
  stores: StoreAssignment[];
  costConfig: CostConfig | null;
}

interface StoreOption {
  id: string;
  name: string;
  city: string | null;
}

interface CountryOption {
  code: string;
  name: string;
  employerRate: number;
  minimumWageHour: number;
  reductionEnabled: boolean;
  reductionMaxCoeff: number;
  reductionThreshold: number;
}

/** Calculate Fillon coefficient (same formula as server) */
function calcFillonCoeff(
  grossPeriod: number,
  smicPeriod: number,
  maxCoeff: number,
  threshold: number
): number {
  if (grossPeriod <= 0 || smicPeriod <= 0) return 0;
  const ratio = (threshold * smicPeriod) / grossPeriod;
  const C = (maxCoeff / 0.6) * (ratio - 1);
  return Math.max(0, Math.min(C, maxCoeff));
}

/** Calculate employer cost per hour from hourly rate + country rules */
function calcCostPerHour(
  hourlyRateGross: number,
  country: CostCountry,
  employerRateOverride: number | null
): number {
  const employerRate = employerRateOverride ?? country.employerRate;
  const chargesFull = hourlyRateGross * employerRate;

  let reduction = 0;
  if (country.reductionEnabled) {
    const coeff = calcFillonCoeff(
      hourlyRateGross,
      country.minimumWageHour,
      country.reductionMaxCoeff,
      country.reductionThreshold
    );
    reduction = hourlyRateGross * coeff;
    reduction = Math.min(reduction, chargesFull);
  }

  return Math.round((hourlyRateGross + chargesFull - reduction) * 100) / 100;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [allStores, setAllStores] = useState<StoreOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    active: true,
    weeklyHours: "",
    storeIds: [] as string[],
    // Cost fields
    hourlyRateGross: "",
    fixedMissionCost: "",
    countryCode: "FR",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadEmployees = useCallback(async () => {
    const res = await fetch(
      `/api/employees?page=${page}&limit=20&search=${encodeURIComponent(search)}`
    );
    if (res.ok) {
      const data = await res.json();
      setEmployees(data.employees);
      setTotalPages(data.pagination.totalPages);
    }
  }, [page, search]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    fetch("/api/stores?limit=100")
      .then((r) => r.json())
      .then((data) => setAllStores(data.stores || []))
      .catch(() => {});

    fetch("/api/costs/countries")
      .then((r) => r.json())
      .then((data) => setCountries(data.countries || []))
      .catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      active: true,
      weeklyHours: "",
      storeIds: [],
      hourlyRateGross: "",
      fixedMissionCost: "",
      countryCode: "FR",
    });
    setError("");
    setDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      active: emp.active,
      weeklyHours: emp.weeklyHours?.toString() || "",
      storeIds: emp.stores.map((s) => s.store.id),
      hourlyRateGross: emp.costConfig?.hourlyRateGross?.toString() || "",
      fixedMissionCost: emp.costConfig?.fixedMissionCost?.toString() || "",
      countryCode: emp.costConfig?.countryCode || "FR",
    });
    setError("");
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      active: form.active,
      weeklyHours: form.weeklyHours ? parseFloat(form.weeklyHours) : null,
      storeIds: form.storeIds,
    };

    const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
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

    const empData = await res.json();
    const empId = editing ? editing.id : empData.id;

    // Save cost config if hourly rate is provided
    if (form.hourlyRateGross && empId) {
      const costPayload = {
        employeeId: empId,
        countryCode: form.countryCode,
        hourlyRateGross: form.hourlyRateGross,
        fixedMissionCost: form.fixedMissionCost || null,
      };

      const costRes = await fetch("/api/costs/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(costPayload),
      });

      if (!costRes.ok) {
        const costData = await costRes.json();
        setError(costData.error || "Erreur sauvegarde coûts");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    setDialogOpen(false);
    loadEmployees();
  }

  async function handleDelete(emp: Employee) {
    if (
      !confirm(
        `Supprimer l'employé "${emp.firstName} ${emp.lastName}" ? Ses shifts seront aussi supprimés.`
      )
    )
      return;
    await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
    loadEmployees();
  }

  function toggleStore(storeId: string) {
    setForm((f) => ({
      ...f,
      storeIds: f.storeIds.includes(storeId)
        ? f.storeIds.filter((id) => id !== storeId)
        : [...f.storeIds, storeId],
    }));
  }

  // Live calculation of cost per hour in the form
  const formCostPerHour = useMemo(() => {
    if (!form.hourlyRateGross) return null;
    const rate = parseFloat(form.hourlyRateGross);
    if (isNaN(rate) || rate <= 0) return null;
    const country = countries.find((c) => c.code === form.countryCode);
    if (!country) return null;
    return calcCostPerHour(rate, country, null);
  }, [form.hourlyRateGross, form.countryCode, countries]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Employés</h1>
        <Button size="sm" className="sm:size-default" onClick={openCreate}>
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Nouvel employé</span>
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
        {employees.map((emp) => {
          const cost = emp.costConfig;
          const costPerHour = cost
            ? calcCostPerHour(cost.hourlyRateGross, cost.country, cost.employerRateOverride)
            : null;

          return (
            <div
              key={emp.id}
              className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 truncate">
                      {emp.firstName} {emp.lastName}
                    </span>
                    <Badge variant={emp.active ? "success" : "secondary"} className="shrink-0 text-[10px]">
                      {emp.active ? "Actif" : "Inactif"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{emp.email}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(emp)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-50 rounded px-2 py-1.5">
                  <span className="text-gray-400 block">h/sem</span>
                  <span className="font-medium text-gray-700">{emp.weeklyHours ?? "—"}</span>
                </div>
                <div className="bg-gray-50 rounded px-2 py-1.5">
                  <span className="text-gray-400 block">Brut/h</span>
                  <span className="font-medium text-gray-700 font-mono">
                    {cost ? `${cost.hourlyRateGross.toFixed(2)}€` : "—"}
                  </span>
                </div>
                <div className="bg-emerald-50 rounded px-2 py-1.5">
                  <span className="text-emerald-500 block">Chargé/h</span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    {costPerHour != null ? `${costPerHour.toFixed(2)}€` : "—"}
                  </span>
                </div>
              </div>

              {(cost?.fixedMissionCost != null || emp.stores.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {cost?.fixedMissionCost != null && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                      <Euro className="h-3 w-3" />
                      Mission: {cost.fixedMissionCost.toFixed(2)}€
                    </span>
                  )}
                  {emp.stores.map((s) => (
                    <Badge key={s.store.id} variant="outline" className="text-[10px]">
                      {s.store.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {employees.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            Aucun employé trouvé
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">
              {page} / {totalPages}
            </span>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">h/sem</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1"><Euro className="h-3.5 w-3.5" />Brut/h</span>
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Fixe mission</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1"><Euro className="h-3.5 w-3.5" />Chargé/h</span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Boutiques</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const cost = emp.costConfig;
                const costPerHour = cost
                  ? calcCostPerHour(cost.hourlyRateGross, cost.country, cost.employerRateOverride)
                  : null;

                return (
                  <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{emp.firstName} {emp.lastName}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.email}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={emp.active ? "success" : "secondary"}>{emp.active ? "Actif" : "Inactif"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{emp.weeklyHours ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {cost ? <span className="text-gray-900">{cost.hourlyRateGross.toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {cost?.fixedMissionCost != null ? <span className="text-gray-900">{cost.fixedMissionCost.toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {costPerHour != null ? <span className="font-semibold text-emerald-700">{costPerHour.toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {emp.stores.map((s) => (
                          <Badge key={s.store.id} variant="outline">{s.store.name}</Badge>
                        ))}
                        {emp.stores.length === 0 && <span className="text-gray-400">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(emp)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Aucun employé trouvé</td>
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
        <DialogContent className="max-w-lg mx-2 sm:mx-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier l'employé" : "Nouvel employé"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifiez les informations et les coûts de l'employé."
                : "Ajoutez un nouvel employé avec ses paramètres de coût."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Identity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prénom *</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Heures/semaine</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="168"
                  value={form.weeklyHours}
                  onChange={(e) =>
                    setForm({ ...form, weeklyHours: e.target.value })
                  }
                  placeholder="35"
                />
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <label className="flex items-center gap-2 h-9 px-3">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) =>
                      setForm({ ...form, active: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm">Actif</span>
                </label>
              </div>
            </div>

            {/* Cost section */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Euro className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">
                  Paramètres de coût
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Taux horaire brut (€/h)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.hourlyRateGross}
                    onChange={(e) =>
                      setForm({ ...form, hourlyRateGross: e.target.value })
                    }
                    placeholder="12.02"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Coût fixe mission (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.fixedMissionCost}
                    onChange={(e) =>
                      setForm({ ...form, fixedMissionCost: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <Label>Pays</Label>
                <select
                  value={form.countryCode}
                  onChange={(e) =>
                    setForm({ ...form, countryCode: e.target.value })
                  }
                  className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                  {countries.length === 0 && (
                    <option value="FR">FR — France (défaut)</option>
                  )}
                </select>
              </div>

              {/* Live cost preview */}
              {formCostPerHour != null && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-700">
                      Coût horaire chargé
                    </span>
                    <span className="text-lg font-bold text-emerald-800">
                      {formCostPerHour.toFixed(2)} €/h
                    </span>
                  </div>
                  {form.fixedMissionCost && parseFloat(form.fixedMissionCost) > 0 && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-emerald-600">
                        + coût fixe mission
                      </span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {parseFloat(form.fixedMissionCost).toFixed(2)} €
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Stores */}
            <div className="space-y-2">
              <Label>Boutiques assignées</Label>
              <div className="border border-gray-200 rounded-md max-h-32 overflow-auto p-2 space-y-1">
                {allStores.map((store) => (
                  <label
                    key={store.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.storeIds.includes(store.id)}
                      onChange={() => toggleStore(store.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{store.name}</span>
                    {store.city && (
                      <span className="text-xs text-gray-400">
                        ({store.city})
                      </span>
                    )}
                  </label>
                ))}
                {allStores.length === 0 && (
                  <p className="text-sm text-gray-400 p-2">
                    Aucun magasin disponible
                  </p>
                )}
              </div>
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
