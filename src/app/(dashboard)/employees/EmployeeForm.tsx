"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Euro, Shield, CalendarOff, X, Eye, EyeOff, Copy, KeyRound } from "lucide-react";
import { Employee, FormState, StoreOption, SKILL_LABELS, CONTRACT_LABELS, DAY_NAMES } from "./types";
import EmployeeAccessPanel from "./EmployeeAccessPanel";

const ALL_SKILLS = Object.keys(SKILL_LABELS);
const ALL_CONTRACTS = Object.keys(CONTRACT_LABELS);

interface Props {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editing: Employee | null;
  setEditing: (emp: Employee) => void;
  allStores: StoreOption[];
  storesLoading: boolean;
  storesError: boolean;
  error: string;
  loading: boolean;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  formCostPerHour: number | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onResetPasswordClick: () => void;
  onToggleSkill: (skill: string) => void;
  onToggleStore: (storeId: string) => void;
  generatePassword: () => string;
  loadEmployees: () => void;
  setError: (e: string) => void;
}

export default function EmployeeForm({
  form, setForm, editing, setEditing,
  allStores, storesLoading, storesError,
  error, loading, showPassword, setShowPassword,
  formCostPerHour, onSubmit, onCancel, onResetPasswordClick,
  onToggleSkill, onToggleStore, generatePassword,
  loadEmployees, setError,
}: Props) {
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Identity */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Prénom *</Label>
          <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label>Nom *</Label>
          <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Email *</Label>
        <Input type="email" placeholder="email@exemple.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>

      {/* Account section — creation only */}
      {!editing && (
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Compte d&apos;accès</span>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Rôle</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm">
                <option value="EMPLOYEE">Employé</option>
                <option value="MANAGER">Manager</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Mot de passe initial *</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" className="shrink-0" title="Copier" onClick={() => navigator.clipboard.writeText(form.password)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => setForm({ ...form, password: generatePassword() })}>
                  Générer
                </Button>
              </div>
              <p className="text-[11px] text-gray-500">Communiquez ce mot de passe à l&apos;employé. Il devra le changer à la première connexion.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Heures/semaine</Label>
          <Input type="number" step="0.5" min="0" max="168" value={form.weeklyHours} onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })} placeholder="35" />
        </div>
        <div className="space-y-2">
          <Label>Statut</Label>
          <label className="flex items-center gap-2 h-9 px-3">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
            <span className="text-sm">Actif</span>
          </label>
        </div>
      </div>

      {/* Contract & Constraints */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Contrat &amp; Contraintes</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Type de contrat</Label>
            <select value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })} className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm">
              <option value="">— Aucun —</option>
              {ALL_CONTRACTS.map((c) => <option key={c} value={c}>{CONTRACT_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Priorité</Label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm">
              <option value="1">1 — Haute (CDI)</option>
              <option value="2">2 — Moyenne</option>
              <option value="3">3 — Basse (Extra)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="space-y-2">
            <Label>Max h/jour</Label>
            <Input type="number" step="0.5" min="1" max="24" value={form.maxHoursPerDay} onChange={(e) => setForm({ ...form, maxHoursPerDay: e.target.value })} placeholder="10" />
          </div>
          <div className="space-y-2">
            <Label>Max h/sem</Label>
            <Input type="number" step="0.5" min="1" max="168" value={form.maxHoursPerWeek} onChange={(e) => setForm({ ...form, maxHoursPerWeek: e.target.value })} placeholder="48" />
          </div>
          <div className="space-y-2">
            <Label>Repos min (h)</Label>
            <Input type="number" step="0.5" min="0" max="48" value={form.minRestBetween} onChange={(e) => setForm({ ...form, minRestBetween: e.target.value })} placeholder="11" />
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Label>Compétences</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_SKILLS.map((skill) => (
              <button key={skill} type="button" onClick={() => onToggleSkill(skill)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${form.skills.includes(skill) ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {SKILL_LABELS[skill]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Label>Magasin préféré</Label>
          <select value={form.preferredStoreId} onChange={(e) => setForm({ ...form, preferredStoreId: e.target.value })} className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm">
            <option value="">— Aucun —</option>
            {allStores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ""}</option>)}
          </select>
        </div>
        <div className="mt-3 space-y-2">
          <Label>Préférence horaire</Label>
          <select value={form.shiftPreference} onChange={(e) => setForm({ ...form, shiftPreference: e.target.value })} className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm">
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
          <span className="text-sm font-semibold text-gray-700">Paramètres de coût</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Taux horaire brut (€/h)</Label>
            <Input type="number" step="0.01" min="0" value={form.hourlyRateGross} onChange={(e) => setForm({ ...form, hourlyRateGross: e.target.value })} placeholder="12.02" />
          </div>
          <div className="space-y-2">
            <Label>Coût fixe mission (€)</Label>
            <Input type="number" step="0.01" min="0" value={form.fixedMissionCost} onChange={(e) => setForm({ ...form, fixedMissionCost: e.target.value })} placeholder="0.00" />
          </div>
        </div>
        {formCostPerHour != null && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-md p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-700">Coût horaire chargé</span>
              <span className="text-lg font-bold text-emerald-800">{formCostPerHour.toFixed(2)} €/h</span>
            </div>
            {form.fixedMissionCost && parseFloat(form.fixedMissionCost) > 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-emerald-600">+ coût fixe mission</span>
                <span className="text-sm font-semibold text-emerald-700">{parseFloat(form.fixedMissionCost).toFixed(2)} €</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Boutiques assignées */}
      <div className="space-y-2">
        <Label>Boutiques assignées</Label>
        <div className="border border-gray-200 rounded-md max-h-32 overflow-auto p-2 space-y-1">
          {storesLoading && (
            <p className="text-sm text-gray-400 p-2">Chargement des magasins...</p>
          )}
          {!storesLoading && storesError && (
            <p className="text-sm text-red-500 p-2">Aucun magasin trouvé (erreur API)</p>
          )}
          {!storesLoading && !storesError && allStores.map((store) => (
            <label key={store.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={form.storeIds.includes(store.id)} onChange={() => onToggleStore(store.id)} className="rounded" />
              <span className="text-sm">{store.name}</span>
              {store.city && <span className="text-xs text-gray-400">({store.city})</span>}
            </label>
          ))}
          {!storesLoading && !storesError && allStores.length === 0 && (
            <p className="text-sm text-gray-400 p-2">Aucun magasin disponible</p>
          )}
        </div>
      </div>

      {/* Unavailabilities — edit only */}
      {editing && (
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarOff className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Indisponibilités</span>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Jours fixes (chaque semaine)</Label>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const isUnavail = editing.unavailabilities?.some((u) => u.type === "FIXED" && u.dayOfWeek === day);
                return (
                  <button key={day} type="button"
                    onClick={async () => {
                      if (isUnavail) {
                        const unavail = editing.unavailabilities.find((u) => u.type === "FIXED" && u.dayOfWeek === day);
                        if (unavail) {
                          await fetch(`/api/unavailabilities?id=${unavail.id}`, { method: "DELETE" });
                          loadEmployees();
                          setEditing({ ...editing, unavailabilities: editing.unavailabilities.filter((u) => u.id !== unavail.id) });
                        }
                      } else {
                        const res = await fetch("/api/unavailabilities", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ employeeId: editing.id, type: "FIXED", dayOfWeek: day }),
                        });
                        if (res.ok) {
                          const newUnavail = await res.json();
                          setEditing({ ...editing, unavailabilities: [...editing.unavailabilities, newUnavail] });
                          loadEmployees();
                        }
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isUnavail ? "bg-red-100 text-red-700 ring-1 ring-red-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {DAY_NAMES[day]}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400">Cliquez pour activer/désactiver. Rouge = indisponible.</p>
          </div>
          <div className="mt-3 space-y-2">
            <Label className="text-xs text-gray-500">Dates spécifiques</Label>
            <div className="flex gap-2">
              <Input type="date" id="unavail-date" className="flex-1 text-sm" />
              <Input type="text" id="unavail-reason" placeholder="Raison (optionnel)" className="flex-1 text-sm" />
              <Button type="button" size="sm" variant="outline" onClick={async () => {
                const dateInput = document.getElementById("unavail-date") as HTMLInputElement;
                const reasonInput = document.getElementById("unavail-reason") as HTMLInputElement;
                if (!dateInput.value) return;
                setError("");
                try {
                  const res = await fetch("/api/unavailabilities", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeId: editing.id, type: "VARIABLE", date: dateInput.value, reason: reasonInput.value || null }),
                  });
                  if (res.ok) {
                    const newUnavail = await res.json();
                    setEditing({ ...editing, unavailabilities: [...editing.unavailabilities, newUnavail] });
                    dateInput.value = "";
                    reasonInput.value = "";
                    loadEmployees();
                  } else {
                    const errData = await res.json().catch(() => ({}));
                    setError(errData.error || `Erreur ${res.status}`);
                  }
                } catch {
                  setError("Erreur réseau lors de l'ajout de l'indisponibilité");
                }
              }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {editing.unavailabilities?.filter((u) => u.type === "VARIABLE").map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-orange-50 rounded px-2.5 py-1.5 text-xs">
                <span className="text-orange-800">
                  {u.date ? new Date(u.date).toLocaleDateString("fr-FR") : "—"}
                  {u.reason && <span className="text-orange-500 ml-2">({u.reason})</span>}
                </span>
                <button type="button" onClick={async () => {
                  setError("");
                  try {
                    const delRes = await fetch(`/api/unavailabilities?id=${u.id}`, { method: "DELETE" });
                    if (delRes.ok) {
                      setEditing({ ...editing, unavailabilities: editing.unavailabilities.filter((x) => x.id !== u.id) });
                      loadEmployees();
                    } else {
                      const errData = await delRes.json().catch(() => ({}));
                      setError(errData.error || `Erreur ${delRes.status}`);
                    }
                  } catch {
                    setError("Erreur réseau lors de la suppression");
                  }
                }} className="text-red-400 hover:text-red-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accès terrain — edit only */}
      {editing && editing.employeeCode !== undefined && (
        <EmployeeAccessPanel
          employee={editing as Employee & {
            employeeCode: string;
            accessStatus: "ACTIVE" | "BLOCKED" | "SUSPENDED";
            blockedAt: string | null;
            blockedReason: string | null;
            forceCodeChange: boolean;
            lastLoginAt: string | null;
            posPin: string | null;
          }}
          onRefresh={loadEmployees}
          setError={setError}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={loading}>{loading ? "..." : editing ? "Enregistrer" : "Créer"}</Button>
      </div>
    </form>
  );
}
