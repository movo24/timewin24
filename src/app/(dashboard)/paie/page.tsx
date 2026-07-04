"use client";

import { useState, useEffect, useCallback } from "react";
import { StoreSearch } from "@/components/store-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACT_TYPES } from "@/lib/payroll/contract";
import {
  FileSpreadsheet,
  Download,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Info,
  Clock,
  Save,
  Lock,
  CheckCircle2,
  RotateCcw,
  Eye,
  Database,
  Building2,
} from "lucide-react";

/**
 * Écran RH — Variables de paie (Étage 2).
 *
 * Deux onglets :
 *  - « Aperçu » : calcul LIVE depuis pointages/absences (GET /api/payroll/preview),
 *    lecture seule, export CSV.
 *  - « Enregistré » : variables PERSISTÉES (GET /api/payroll/inputs) avec cycle
 *    de statut draft → validated → locked (POST /api/payroll/persist puis
 *    PATCH /api/payroll/inputs/[id]).
 *
 * Frontière : QUANTITÉS uniquement (heures, jours, minutes). Aucun euro, aucun
 * taux, aucune cotisation, aucun net/brut. La valorisation reste au moteur de
 * paie externe / expert-comptable.
 */

interface PayrollVariables {
  totalWorkedHours: number;
  normalHours: number;
  overtimeHours: number;
  complementaryHours: number;
  sundayHours: number;
  holidayHours: number;
  paidLeaveDays: number;
  sickOrAccidentDays: number;
  otherAbsenceDays: number;
  latenessMinutes: number;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
function shiftPeriod(period: string, dir: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export default function PaiePage() {
  const [storeId, setStoreId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [tab, setTab] = useState<"preview" | "persisted" | "establishment">("preview");

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Variables de paie</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
          Quantités qualifiées mensuelles — aperçu live ou variables enregistrées
        </p>
      </div>

      {/* Bandeau frontière */}
      <div className="mb-4 flex items-start gap-2 text-xs sm:text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Ces données sont des <strong>quantités qualifiées</strong> (heures, jours, minutes). Aucune
          valorisation en euros n&apos;est effectuée ici : la transformation en montants relève du moteur
          de paie / expert-comptable.
        </span>
      </div>

      {/* Sélecteurs partagés */}
      <div className="space-y-3 mb-4">
        <div className="w-full lg:w-72">
          <StoreSearch value={storeId} onChange={setStoreId} placeholder="Sélectionner une boutique..." />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPeriod(shiftPeriod(period, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setPeriod(currentPeriod())}>
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Mois courant
          </Button>
          <span className="text-xs sm:text-sm font-medium text-gray-700 text-center flex-1 sm:flex-none capitalize">
            {periodLabel(period)}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPeriod(shiftPeriod(period, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-100 rounded-lg p-0.5 mb-4 sm:mb-6 w-full sm:w-fit">
        <TabButton active={tab === "preview"} onClick={() => setTab("preview")} icon={Eye} label="Aperçu (live)" />
        <TabButton active={tab === "persisted"} onClick={() => setTab("persisted")} icon={Database} label="Enregistré" />
        <TabButton active={tab === "establishment"} onClick={() => setTab("establishment")} icon={Building2} label="Établissement" />
      </div>

      {!storeId ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <FileSpreadsheet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Sélectionnez une boutique pour afficher les variables de paie</p>
        </div>
      ) : tab === "preview" ? (
        <PreviewTab storeId={storeId} period={period} />
      ) : tab === "persisted" ? (
        <PersistedTab storeId={storeId} period={period} />
      ) : (
        <EstablishmentTab storeId={storeId} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-md transition-colors whitespace-nowrap ${
        active ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"
      }`}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 inline-block mr-1 sm:mr-1.5 -mt-0.5" />
      {label}
    </button>
  );
}

// ─── Onglet Aperçu (live, lecture seule) ───────────────────────────

interface PreviewRow {
  employeeId: string;
  contractId: string | null;
  variables: PayrollVariables;
}

function PreviewTab({ storeId, period }: { storeId: string; period: string }) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch("/api/employees?limit=500")
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((d) => setNames(new Map((d.employees || []).map((e: { id: string; firstName: string; lastName: string }) => [e.id, `${e.firstName} ${e.lastName}`]))))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/preview?storeId=${encodeURIComponent(storeId)}&period=${period}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors du calcul de l'aperçu");
        setRows([]);
      } else {
        setRows((json.data ?? json).rows ?? []);
      }
    } catch {
      setError("Erreur réseau");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, period]);

  useEffect(() => {
    load();
  }, [load]);

  function downloadCsv() {
    window.open(`/api/payroll/preview?storeId=${encodeURIComponent(storeId)}&period=${period}&format=csv`, "_blank");
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (rows.length === 0) return <Empty label={`Aucun pointage sur ${periodLabel(period)}`} />;

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button variant="outline" size="sm" className="h-9" onClick={downloadCsv}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>
      <VariablesTable
        rows={rows.map((r) => ({ key: r.employeeId, name: names.get(r.employeeId) || r.employeeId, v: r.variables }))}
      />
    </>
  );
}

// ─── Onglet Enregistré (persisté + cycle de statut) ────────────────

interface PersistedRow extends PayrollVariables {
  id: string;
  status: "draft" | "validated" | "locked";
  contractId: string;
  employeeId: string;
  employeeName: string;
}

function PersistedTab({ storeId, period }: { storeId: string; period: string }) {
  const [rows, setRows] = useState<PersistedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/inputs?storeId=${encodeURIComponent(storeId)}&period=${period}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors du chargement");
        setRows([]);
      } else {
        setRows((json.data ?? json).rows ?? []);
      }
    } catch {
      setError("Erreur réseau");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, period]);

  useEffect(() => {
    load();
  }, [load]);

  async function persist() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/persist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, period }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Erreur lors de l'enregistrement");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, status: PersistedRow["status"]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/inputs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Transition refusée");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-xs text-gray-500">
          {rows.length > 0 ? `${rows.length} ligne(s) enregistrée(s)` : "Aucune variable enregistrée pour cette période"}
        </p>
        <Button size="sm" className="h-9" onClick={persist} disabled={busy}>
          <Save className="h-4 w-4 mr-1.5" />
          {busy ? "..." : "Calculer & enregistrer (brouillon)"}
        </Button>
      </div>

      {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty label="Cliquez sur « Calculer & enregistrer » pour générer les brouillons du mois" />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Employé</th>
                <th className="text-left px-3 py-2.5 font-medium text-gray-500">Statut</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">Travaillées</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">Sup.</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">Compl.</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">Dim.</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">Fériées</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">CP</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">Arrêt</th>
                <th className="text-right px-3 py-2.5 font-medium text-gray-500">Retard</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{r.employeeName}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-right">{r.totalWorkedHours}h</td>
                  <td className="px-3 py-2 text-right text-orange-600">{r.overtimeHours}h</td>
                  <td className="px-3 py-2 text-right text-amber-600">{r.complementaryHours}h</td>
                  <td className="px-3 py-2 text-right">{r.sundayHours}h</td>
                  <td className="px-3 py-2 text-right">{r.holidayHours}h</td>
                  <td className="px-3 py-2 text-right text-blue-600">{r.paidLeaveDays}j</td>
                  <td className="px-3 py-2 text-right text-red-600">{r.sickOrAccidentDays}j</td>
                  <td className="px-3 py-2 text-right text-gray-500">{r.latenessMinutes}min</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === "draft" && (
                        <ActionBtn title="Valider" icon={CheckCircle2} disabled={busy} onClick={() => changeStatus(r.id, "validated")} />
                      )}
                      {r.status === "validated" && (
                        <>
                          <ActionBtn title="Verrouiller" icon={Lock} disabled={busy} onClick={() => changeStatus(r.id, "locked")} />
                          <ActionBtn title="Rouvrir" icon={RotateCcw} disabled={busy} onClick={() => changeStatus(r.id, "draft")} />
                        </>
                      )}
                      {r.status === "locked" && <span className="text-xs text-gray-400">verrouillé</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Onglet Établissement (métadonnées SIRET / contrats) ───────────

interface ContractRow {
  id: string;
  contractType: string;
  weeklyHours: number;
  startDate: string;
  endDate: string | null;
  employee: { id: string; firstName: string; lastName: string };
}
interface Establishment {
  id: string;
  storeId: string;
  siret: string | null;
  legalName: string | null;
  apeCode: string | null;
  contracts: ContractRow[];
}

function EstablishmentTab({ storeId }: { storeId: string }) {
  const [est, setEst] = useState<Establishment | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [form, setForm] = useState({ siret: "", legalName: "", apeCode: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/establishment?storeId=${encodeURIComponent(storeId)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors du chargement");
        setEst(null);
      } else {
        const e: Establishment = (json.data ?? json).establishment;
        setEst(e);
        setForm({ siret: e.siret ?? "", legalName: e.legalName ?? "", apeCode: e.apeCode ?? "" });
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!est) return;
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(`/api/payroll/establishment/${est.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors de l'enregistrement");
      } else {
        setOk(true);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (error && !est) return <ErrorBox message={error} />;
  if (!est) return <Empty label="Aucun établissement" />;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Identité de l&apos;établissement</h3>
        <p className="text-xs text-gray-500 mb-4">
          Le SIRET est requis pour la déclaration sociale (DSN). Identifiants administratifs uniquement.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">SIRET (14 chiffres)</Label>
            <Input
              value={form.siret}
              onChange={(e) => setForm({ ...form, siret: e.target.value })}
              placeholder="ex : 732 829 320 00074"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Raison sociale</Label>
            <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Code APE / NAF</Label>
            <Input value={form.apeCode} onChange={(e) => setForm({ ...form, apeCode: e.target.value })} placeholder="ex : 4711D" className="mt-1" />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {ok && !error && <p className="mt-3 text-sm text-green-600">Enregistré.</p>}
        <Button className="mt-4" size="sm" onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? "..." : "Enregistrer"}
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Contrats provisionnés ({est.contracts.length})</h3>
        {est.contracts.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">
            Aucun contrat. Les contrats sont provisionnés lors de l&apos;enregistrement des variables (onglet « Enregistré »).
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Salarié</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Type</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Heures/sem.</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Début</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Fin</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {est.contracts.map((c) => (
                  <ContractRowEditor key={c.id} contract={c} onSaved={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function toDateInput(d: string | null): string {
  return d ? String(d).slice(0, 10) : "";
}

function ContractRowEditor({ contract, onSaved }: { contract: ContractRow; onSaved: () => void | Promise<void> }) {
  const [type, setType] = useState(contract.contractType);
  const [hours, setHours] = useState(String(contract.weeklyHours));
  const [start, setStart] = useState(toDateInput(contract.startDate));
  const [end, setEnd] = useState(toDateInput(contract.endDate));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    type !== contract.contractType ||
    hours !== String(contract.weeklyHours) ||
    start !== toDateInput(contract.startDate) ||
    end !== toDateInput(contract.endDate);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/payroll/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractType: type, weeklyHours: Number(hours), startDate: start, endDate: end || null }),
      });
      const json = await res.json();
      if (!res.ok) setErr(json.error || "Erreur");
      else await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">
        {contract.employee.firstName} {contract.employee.lastName}
        {err && <span className="block text-[11px] text-red-600">{err}</span>}
      </td>
      <td className="px-3 py-2">
        <select
          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {CONTRACT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <Input type="number" min="1" max="48" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 w-20" />
      </td>
      <td className="px-3 py-2">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-36" />
      </td>
      <td className="px-3 py-2">
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 w-36" />
      </td>
      <td className="px-4 py-2 text-right">
        <Button size="sm" variant="outline" className="h-8" onClick={save} disabled={saving || !dirty}>
          {saving ? "..." : "Enregistrer"}
        </Button>
      </td>
    </tr>
  );
}

// ─── Composants partagés ───────────────────────────────────────────

function VariablesTable({ rows }: { rows: Array<{ key: string; name: string; v: PayrollVariables }> }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2.5 font-medium text-gray-500">Employé</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">Travaillées</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">Normales</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">Sup.</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">Compl.</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">Dim.</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">Fériées</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">CP</th>
            <th className="text-right px-3 py-2.5 font-medium text-gray-500">Arrêt</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-500">Retard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
              <td className="px-3 py-2 text-right">{r.v.totalWorkedHours}h</td>
              <td className="px-3 py-2 text-right text-gray-600">{r.v.normalHours}h</td>
              <td className="px-3 py-2 text-right text-orange-600">{r.v.overtimeHours}h</td>
              <td className="px-3 py-2 text-right text-amber-600">{r.v.complementaryHours}h</td>
              <td className="px-3 py-2 text-right">{r.v.sundayHours}h</td>
              <td className="px-3 py-2 text-right">{r.v.holidayHours}h</td>
              <td className="px-3 py-2 text-right text-blue-600">{r.v.paidLeaveDays}j</td>
              <td className="px-3 py-2 text-right text-red-600">{r.v.sickOrAccidentDays}j</td>
              <td className="px-4 py-2 text-right text-gray-500">{r.v.latenessMinutes}min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "validated" | "locked" }) {
  const map = {
    draft: { label: "Brouillon", cls: "bg-gray-100 text-gray-600" },
    validated: { label: "Validé", cls: "bg-green-100 text-green-700" },
    locked: { label: "Verrouillé", cls: "bg-gray-900 text-white" },
  } as const;
  const s = map[status];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

function ActionBtn({ title, icon: Icon, onClick, disabled }: { title: string; icon: React.ElementType; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Loading() {
  return <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">Chargement...</div>;
}
function ErrorBox({ message }: { message: string }) {
  return <div className="bg-white border border-red-200 rounded-lg p-8 text-center text-red-600">{message}</div>;
}
function Empty({ label }: { label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
      <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-500">{label}</p>
    </div>
  );
}
