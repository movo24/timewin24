"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, RefreshCw } from "lucide-react";
import EmployeeList from "./EmployeeList";
import EmployeeModal from "./EmployeeModal";
import { Employee, FormState, StoreOption, calcCostPerHour } from "./types";

const FRANCE_DEFAULTS = {
  code: "FR", name: "France",
  employerRate: 0.45, minimumWageHour: 12.02,
  reductionEnabled: true, reductionMaxCoeff: 0.3206, reductionThreshold: 1.6,
};

function generatePassword(length = 10): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  let result = "";
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

const EMPTY_FORM: FormState = {
  firstName: "", lastName: "", email: "", password: "",
  role: "EMPLOYEE", active: true,
  weeklyHours: "", contractType: "", priority: "1",
  maxHoursPerDay: "10", maxHoursPerWeek: "48", minRestBetween: "11",
  skills: [], preferredStoreId: "", shiftPreference: "JOURNEE",
  storeIds: [], hourlyRateGross: "", fixedMissionCost: "",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [allStores, setAllStores] = useState<StoreOption[]>([]);
  const [storesError, setStoresError] = useState(false);
  const [storesLoading, setStoresLoading] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, password: generatePassword() });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Score dialog state
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [scoreLoading, setScoreLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scoreBreakdown, setScoreBreakdown] = useState<any>(null);
  const [scoreEmployee, setScoreEmployee] = useState<{ firstName: string; lastName: string } | null>(null);

  // Password success state
  const [passwordSuccessOpen, setPasswordSuccessOpen] = useState(false);
  const [passwordSuccessValue, setPasswordSuccessValue] = useState("");
  const [passwordSuccessName, setPasswordSuccessName] = useState("");
  const [passwordSuccessMode, setPasswordSuccessMode] = useState<"create" | "reset">("create");
  const [passwordCopied, setPasswordCopied] = useState(false);

  const loadEmployees = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/employees?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEmployees(data.employees);
      setTotalPages(data.pagination.totalPages);
    }
  }, [page, search]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  // Fetch stores whenever dialog opens
  useEffect(() => {
    if (!dialogOpen) return;
    setStoresLoading(true);
    setStoresError(false);
    fetch("/api/stores?limit=50")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const stores = data.stores || [];
        setAllStores(stores);
        if (stores.length === 0) setStoresError(true);
      })
      .catch(() => setStoresError(true))
      .finally(() => setStoresLoading(false));
  }, [dialogOpen]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, password: generatePassword() });
    setShowPassword(true);
    setError("");
    setDialogOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email || "",
      password: "",
      role: "EMPLOYEE",
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
    setShowPassword(false);
    setError("");
    setDialogOpen(true);
  }

  function toggleSkill(skill: string) {
    setForm((f) => ({ ...f, skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill] }));
  }

  function toggleStore(storeId: string) {
    setForm((f) => ({ ...f, storeIds: f.storeIds.includes(storeId) ? f.storeIds.filter((id) => id !== storeId) : [...f.storeIds, storeId] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload: Record<string, unknown> = {
      firstName: form.firstName, lastName: form.lastName,
      email: form.email.trim(), active: form.active,
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
    if (!editing) { payload.password = form.password; payload.role = form.role; }

    const res = await fetch(editing ? `/api/employees/${editing.id}` : "/api/employees", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || `Erreur serveur (${res.status})`);
      setLoading(false);
      return;
    }

    const empData = await res.json();
    const empId = editing ? editing.id : empData.id;

    if (form.hourlyRateGross && empId) {
      const costRes = await fetch("/api/costs/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: empId,
          countryCode: "FR",
          hourlyRateGross: parseFloat(form.hourlyRateGross),
          fixedMissionCost: form.fixedMissionCost ? parseFloat(form.fixedMissionCost) : null,
        }),
      });
      if (!costRes.ok) {
        const costData = await costRes.json().catch(() => ({}));
        setError(costData.error || "Erreur sauvegarde coûts");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    setDialogOpen(false);

    if (!editing) {
      setPasswordSuccessValue(form.password);
      setPasswordSuccessName(`${form.firstName} ${form.lastName}`);
      setPasswordSuccessMode("create");
      setPasswordCopied(false);
      setPasswordSuccessOpen(true);
    }

    loadEmployees();
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Supprimer l'employé "${emp.firstName} ${emp.lastName}" ? Ses shifts seront aussi supprimés.`)) return;
    try {
      const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      loadEmployees();
    } catch { alert("Erreur réseau"); }
  }

  async function openScoreDetail(emp: Employee) {
    setScoreEmployee({ firstName: emp.firstName, lastName: emp.lastName });
    setScoreDialogOpen(true);
    setScoreLoading(true);
    try {
      const res = await fetch(`/api/employees/reliability/${emp.id}`);
      if (res.ok) { const data = await res.json(); setScoreBreakdown(data.breakdown); }
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

  const formCostPerHour = useMemo(() => {
    if (!form.hourlyRateGross) return null;
    const rate = parseFloat(form.hourlyRateGross);
    if (isNaN(rate) || rate <= 0) return null;
    return calcCostPerHour(rate, FRANCE_DEFAULTS, null);
  }, [form.hourlyRateGross]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Employés</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleRecalculateAll} disabled={recalculating} className="text-xs">
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
        <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      <EmployeeList
        employees={employees}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onEdit={openEdit}
        onDelete={handleDelete}
        onScoreDetail={openScoreDetail}
      />

      <EmployeeModal
        dialogOpen={dialogOpen}
        setDialogOpen={setDialogOpen}
        editing={editing}
        setEditing={(emp) => setEditing(emp)}
        form={form}
        setForm={setForm}
        allStores={allStores}
        storesLoading={storesLoading}
        storesError={storesError}
        error={error}
        setError={setError}
        loading={loading}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        formCostPerHour={formCostPerHour}
        onSubmit={handleSubmit}
        onToggleSkill={toggleSkill}
        onToggleStore={toggleStore}
        generatePassword={generatePassword}
        loadEmployees={loadEmployees}
        scoreDialogOpen={scoreDialogOpen}
        setScoreDialogOpen={setScoreDialogOpen}
        scoreLoading={scoreLoading}
        scoreBreakdown={scoreBreakdown}
        scoreEmployee={scoreEmployee}
        passwordSuccessOpen={passwordSuccessOpen}
        setPasswordSuccessOpen={setPasswordSuccessOpen}
        passwordSuccessValue={passwordSuccessValue}
        passwordSuccessName={passwordSuccessName}
        passwordSuccessMode={passwordSuccessMode}
        passwordCopied={passwordCopied}
        setPasswordCopied={setPasswordCopied}
        onPasswordSuccess={(password, name, mode) => {
          setPasswordSuccessValue(password);
          setPasswordSuccessName(name);
          setPasswordSuccessMode(mode);
          setPasswordCopied(false);
          setPasswordSuccessOpen(true);
        }}
      />
    </div>
  );
}
