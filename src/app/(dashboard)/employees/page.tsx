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
  Clock,
  Shield,
  CalendarOff,
  X,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { ScoreBadge, ScoreBar, ScoreBreakdownPanel } from "@/components/reliability-score";

const CONTRACT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERIM: "Intérim",
  EXTRA: "Extra",
  STAGE: "Stage",
};

const SKILL_LABELS: Record<string, string> = {
  CAISSE: "Caisse",
  OUVERTURE: "Ouverture",
  FERMETURE: "Fermeture",
  GESTION: "Gestion",
  MANAGER: "Manager",
  CONSEIL: "Conseil",
  STOCK: "Stock",
  SAV: "SAV",
};

const SHIFT_PREF_LABELS: Record<string, string> = {
  MATIN: "Matin uniquement",
  APRES_MIDI: "Après-midi uniquement",
  JOURNEE: "Journée complète",
};

const ALL_SKILLS = Object.keys(SKILL_LABELS);
const ALL_CONTRACTS = Object.keys(CONTRACT_LABELS);
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

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

interface Unavailability {
  id: string;
  type: "FIXED" | "VARIABLE";
  dayOfWeek: number | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
  weeklyHours: number | null;
  contractType: string | null;
  priority: number;
  maxHoursPerDay: number | null;
  maxHoursPerWeek: number | null;
  minRestBetween: number | null;
  skills: string[];
  preferredStoreId: string | null;
  shiftPreference: string | null;
  stores: StoreAssignment[];
  costConfig: CostConfig | null;
  unavailabilities: Unavailability[];
  reliabilityScore: number | null;
  scoreUpdatedAt: string | null;
}

interface StoreOption {
  id: string;
  name: string;
  city: string | null;
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
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    active: true,
    weeklyHours: "",
    contractType: "" as string,
    priority: "1",
    maxHoursPerDay: "10",
    maxHoursPerWeek: "48",
    minRestBetween: "11",
    skills: [] as string[],
    preferredStoreId: "" as string,
    shiftPreference: "JOURNEE" as string,
    storeIds: [] as string[],
    // Cost fields
    hourlyRateGross: "",
    fixedMissionCost: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [scoreLoading, setScoreLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scoreBreakdown, setScoreBreakdown] = useState<any>(null);
  const [scoreEmployee, setScoreEmployee] = useState<{ firstName: string; lastName: string } | null>(null);
  const [recalculating, setRecalculating] = useState(false);

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
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      active: true,
      weeklyHours: "",
      contractType: "",
      priority: "1",
      maxHoursPerDay: "10",
      maxHoursPerWeek: "48",
      minRestBetween: "11",
      skills: [],
      preferredStoreId: "",
      shiftPreference: "JOURNEE",
      storeIds: [],
      hourlyRateGross: "",
      fixedMissionCost: "",
    });
    setError("");
    setDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email || "",
      active: emp.active,
      weeklyHours: emp.weeklyHours?.toString() || "",
      contractType: emp.contractType || "",
      priority: emp.priority?.toString() || "1",
      maxHoursPerDay: emp.maxHoursPerDay?.toString() || "10",
      maxHoursPerWeek: emp.maxHoursPerWeek?.toString() || "48",
      minRestBetween: emp.minRestBetween?.toString() || "11",
      skills: emp.skills || [],
      preferredStoreId: emp.preferredStoreId || "",
      shiftPreference: emp.shiftPreference || "JOURNEE",
      storeIds: emp.stores.map((s) => s.store.id),
      hourlyRateGross: emp.costConfig?.hourlyRateGross?.toString() || "",
      fixedMissionCost: emp.costConfig?.fixedMissionCost?.toString() || "",
    });
    setError("");
    setDialogOpen(true);
  }

  function toggleSkill(skill: string) {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter((s) => s !== skill)
        : [...f.skills, skill],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email.trim() || null,
      active: form.active,
      weeklyHours: form.weeklyHours ? parseFloat(form.weeklyHours) : null,
      contractType: form.contractType || null,
      priority: parseInt(form.priority) || 1,
      maxHoursPerDay: form.maxHoursPerDay ? parseFloat(form.maxHoursPerDay) : null,
      maxHoursPerWeek: form.maxHoursPerWeek ? parseFloat(form.maxHoursPerWeek) : null,
      minRestBetween: form.minRestBetween ? parseFloat(form.minRestBetween) : null,
      skills: form.skills,
      preferredStoreId: form.preferredStoreId || null,
      shiftPreference: form.shiftPreference || "JOURNEE",
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
      try {
        const data = await res.json();
        setError(data.error || "Erreur");
      } catch {
        setError(`Erreur serveur (${res.status})`);
      }
      setLoading(false);
      return;
    }

    const empData = await res.json();
    const empId = editing ? editing.id : empData.id;

    // Save cost config if hourly rate is provided
    if (form.hourlyRateGross && empId) {
      const costPayload = {
        employeeId: empId,
        countryCode: "FR",
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

  async function openScoreDetail(emp: Employee) {
    setScoreEmployee({ firstName: emp.firstName, lastName: emp.lastName });
    setScoreDialogOpen(true);
    setScoreLoading(true);
    try {
      const res = await fetch(`/api/employees/reliability/${emp.id}`);
      if (res.ok) {
        const data = await res.json();
        setScoreBreakdown(data.breakdown);
      }
    } catch { /* silent */ }
    setScoreLoading(false);
  }

  async function handleRecalculateAll() {
    setRecalculating(true);
    try {
      await fetch("/api/employees/reliability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      loadEmployees();
    } catch { /* silent */ }
    setRecalculating(false);
  }

  // Live calculation of cost per hour in the form (France only)
  const formCostPerHour = useMemo(() => {
    if (!form.hourlyRateGross) return null;
    const rate = parseFloat(form.hourlyRateGross);
    if (isNaN(rate) || rate <= 0) return null;
    // Use France defaults directly
    const franceDefaults: CostCountry = {
      code: "FR",
      name: "France",
      employerRate: 0.45,
      minimumWageHour: 12.02,
      reductionEnabled: true,
      reductionMaxCoeff: 0.3206,
      reductionThreshold: 1.6,
    };
    return calcCostPerHour(rate, franceDefaults, null);
  }, [form.hourlyRateGross]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Employés</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecalculateAll}
            disabled={recalculating}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${recalculating ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{recalculating ? "Calcul..." : "Scores fiabilité"}</span>
          </Button>
          <Button size="sm" className="sm:size-default" onClick={openCreate}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Nouvel employé</span>
          </Button>
        </div>
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

              <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
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
                <button
                  onClick={() => openScoreDetail(emp)}
                  className="bg-gray-50 rounded px-2 py-1.5 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-gray-400 block">Fiabilité</span>
                  <ScoreBadge score={emp.reliabilityScore} />
                </button>
              </div>

              {/* Contract & skills row */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {emp.contractType && (
                  <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                    {CONTRACT_LABELS[emp.contractType] || emp.contractType}
                  </Badge>
                )}
                {emp.shiftPreference && emp.shiftPreference !== "JOURNEE" && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                    {SHIFT_PREF_LABELS[emp.shiftPreference] || emp.shiftPreference}
                  </Badge>
                )}
                {emp.skills?.map((skill) => (
                  <Badge key={skill} variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">
                    {SKILL_LABELS[skill] || skill}
                  </Badge>
                ))}
                {emp.unavailabilities?.filter((u) => u.type === "FIXED").length > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">
                    <CalendarOff className="h-2.5 w-2.5 mr-0.5" />
                    {emp.unavailabilities.filter((u) => u.type === "FIXED").map((u) => DAY_NAMES[u.dayOfWeek ?? 0]).join(", ")}
                  </Badge>
                )}
              </div>

              {(cost?.fixedMissionCost != null || emp.stores.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
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
                <th className="text-center px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Fiabilité</span>
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
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openScoreDetail(emp)} className="hover:opacity-70 transition-opacity">
                        <ScoreBar score={emp.reliabilityScore} />
                      </button>
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
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Aucun employé trouvé</td>
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
          <form onSubmit={handleSubmit} noValidate className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
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
              <Label>Email</Label>
              <Input
                type="text"
                placeholder="optionnel"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
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

            {/* Contract & Constraints */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">
                  Contrat & Contraintes
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type de contrat</Label>
                  <select
                    value={form.contractType}
                    onChange={(e) => setForm({ ...form, contractType: e.target.value })}
                    className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">— Aucun —</option>
                    {ALL_CONTRACTS.map((c) => (
                      <option key={c} value={c}>{CONTRACT_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Priorité</Label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="1">1 — Haute (CDI)</option>
                    <option value="2">2 — Moyenne</option>
                    <option value="3">3 — Basse (Extra)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="space-y-2">
                  <Label>Max h/jour</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    max="24"
                    value={form.maxHoursPerDay}
                    onChange={(e) => setForm({ ...form, maxHoursPerDay: e.target.value })}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max h/sem</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    max="168"
                    value={form.maxHoursPerWeek}
                    onChange={(e) => setForm({ ...form, maxHoursPerWeek: e.target.value })}
                    placeholder="48"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Repos min (h)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="48"
                    value={form.minRestBetween}
                    onChange={(e) => setForm({ ...form, minRestBetween: e.target.value })}
                    placeholder="11"
                  />
                </div>
              </div>

              {/* Skills */}
              <div className="mt-3 space-y-2">
                <Label>Compétences</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SKILLS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        form.skills.includes(skill)
                          ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {SKILL_LABELS[skill]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preferred store */}
              <div className="mt-3 space-y-2">
                <Label>Magasin préféré</Label>
                <select
                  value={form.preferredStoreId}
                  onChange={(e) => setForm({ ...form, preferredStoreId: e.target.value })}
                  className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="">— Aucun —</option>
                  {allStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.city ? `(${s.city})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shift preference */}
              <div className="mt-3 space-y-2">
                <Label>Préférence horaire</Label>
                <select
                  value={form.shiftPreference}
                  onChange={(e) => setForm({ ...form, shiftPreference: e.target.value })}
                  className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="JOURNEE">Journée complète</option>
                  <option value="MATIN">Matin uniquement</option>
                  <option value="APRES_MIDI">Après-midi uniquement</option>
                </select>
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

              {/* Pays fixé à France */}

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

            {/* Unavailabilities (edit mode only) */}
            {editing && (
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarOff className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-700">
                    Indisponibilités
                  </span>
                </div>

                {/* Fixed (weekly recurring) */}
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Jours fixes (chaque semaine)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                      const isUnavail = editing.unavailabilities?.some(
                        (u) => u.type === "FIXED" && u.dayOfWeek === day
                      );
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={async () => {
                            if (isUnavail) {
                              // Remove it
                              const unavail = editing.unavailabilities.find(
                                (u) => u.type === "FIXED" && u.dayOfWeek === day
                              );
                              if (unavail) {
                                await fetch(`/api/unavailabilities?id=${unavail.id}`, { method: "DELETE" });
                                loadEmployees();
                                // Update editing state
                                setEditing({
                                  ...editing,
                                  unavailabilities: editing.unavailabilities.filter((u) => u.id !== unavail.id),
                                });
                              }
                            } else {
                              // Add it
                              const res = await fetch("/api/unavailabilities", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  employeeId: editing.id,
                                  type: "FIXED",
                                  dayOfWeek: day,
                                }),
                              });
                              if (res.ok) {
                                const newUnavail = await res.json();
                                setEditing({
                                  ...editing,
                                  unavailabilities: [...editing.unavailabilities, newUnavail],
                                });
                                loadEmployees();
                              }
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            isUnavail
                              ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {DAY_NAMES[day]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Cliquez pour activer/désactiver. Rouge = indisponible.
                  </p>
                </div>

                {/* Variable (specific dates) */}
                <div className="mt-3 space-y-2">
                  <Label className="text-xs text-gray-500">Dates spécifiques</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      id="unavail-date"
                      className="flex-1 text-sm"
                    />
                    <Input
                      type="text"
                      id="unavail-reason"
                      placeholder="Raison (optionnel)"
                      className="flex-1 text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const dateInput = document.getElementById("unavail-date") as HTMLInputElement;
                        const reasonInput = document.getElementById("unavail-reason") as HTMLInputElement;
                        if (!dateInput.value) return;
                        setError("");
                        try {
                          const res = await fetch("/api/unavailabilities", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              employeeId: editing.id,
                              type: "VARIABLE",
                              date: dateInput.value,
                              reason: reasonInput.value || null,
                            }),
                          });
                          if (res.ok) {
                            const newUnavail = await res.json();
                            setEditing({
                              ...editing,
                              unavailabilities: [...editing.unavailabilities, newUnavail],
                            });
                            dateInput.value = "";
                            reasonInput.value = "";
                            loadEmployees();
                          } else {
                            try {
                              const errData = await res.json();
                              setError(errData.error || `Erreur ${res.status}`);
                            } catch {
                              setError(`Erreur serveur (${res.status})`);
                            }
                          }
                        } catch (err) {
                          console.error("Erreur ajout indisponibilité:", err);
                          setError("Erreur réseau lors de l'ajout de l'indisponibilité");
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* List variable unavailabilities */}
                  {editing.unavailabilities
                    ?.filter((u) => u.type === "VARIABLE")
                    .map((u) => (
                      <div key={u.id} className="flex items-center justify-between bg-orange-50 rounded px-2.5 py-1.5 text-xs">
                        <span className="text-orange-800">
                          {u.date ? new Date(u.date).toLocaleDateString("fr-FR") : "—"}
                          {u.reason && <span className="text-orange-500 ml-2">({u.reason})</span>}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            setError("");
                            try {
                              const delRes = await fetch(`/api/unavailabilities?id=${u.id}`, { method: "DELETE" });
                              if (delRes.ok) {
                                setEditing({
                                  ...editing,
                                  unavailabilities: editing.unavailabilities.filter((x) => x.id !== u.id),
                                });
                                loadEmployees();
                              } else {
                                try {
                                  const errData = await delRes.json();
                                  setError(errData.error || `Erreur ${delRes.status}`);
                                } catch {
                                  setError(`Erreur serveur (${delRes.status})`);
                                }
                              }
                            } catch (err) {
                              console.error("Erreur suppression indisponibilité:", err);
                              setError("Erreur réseau lors de la suppression");
                            }
                          }}
                          className="text-red-400 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

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

      {/* Score detail dialog */}
      <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
        <DialogContent className="max-w-sm mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Score de fiabilité
            </DialogTitle>
            <DialogDescription>
              {scoreEmployee
                ? `${scoreEmployee.firstName} ${scoreEmployee.lastName} — 30 derniers jours`
                : "Chargement..."}
            </DialogDescription>
          </DialogHeader>
          {scoreLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-3 border-gray-400 border-t-transparent rounded-full" />
            </div>
          ) : scoreBreakdown ? (
            <ScoreBreakdownPanel breakdown={scoreBreakdown} />
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              Aucune donnée disponible. Cliquez sur &quot;Scores fiabilité&quot; pour calculer.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
