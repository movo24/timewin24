"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Save, Trash2, Info } from "lucide-react";

/**
 * Administration interne — Société & Unités.
 *
 * Permet à un ADMIN de saisir l'identité légale de la société (dont le SIREN,
 * nécessaire à l'export paie) et de gérer les unités (regroupements de magasins).
 * Consomme les API existantes `/api/organizations` et `/api/units` (requireAdmin).
 * Mono-groupe : en général une seule société.
 */

interface UnitRow {
  id: string;
  name: string;
  type: string;
  _count?: { stores: number };
}
interface OrgRow {
  id: string;
  name: string;
  legalName: string | null;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  units: UnitRow[];
  _count?: { units: number };
}

export default function OrganisationPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/organizations");
      const json = await res.json();
      if (!res.ok) setError(json.error || "Erreur de chargement");
      else setOrgs((json.data ?? json).organizations ?? []);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createOrg() {
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Nouvelle société" }),
    });
    if (res.ok) load();
  }

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Société &amp; unités</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
          Identité légale (SIREN pour la paie) et regroupements de magasins
        </p>
      </div>

      <div className="mb-4 flex items-start gap-2 text-xs sm:text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Le <strong>SIREN</strong> de la société est requis pour l&apos;export des variables de paie.
          Les <strong>unités</strong> regroupent les magasins (région, enseigne…) ; elles sont
          optionnelles pour le fonctionnement courant.
        </span>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400">Chargement...</div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-lg p-8 text-center text-red-600">{error}</div>
      ) : orgs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Aucune société configurée</p>
          <Button size="sm" onClick={createOrg}>
            <Plus className="h-4 w-4 mr-1.5" />
            Créer la société
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} onChanged={load} />
          ))}
          <Button variant="outline" size="sm" onClick={createOrg}>
            <Plus className="h-4 w-4 mr-1.5" />
            Ajouter une société
          </Button>
        </div>
      )}
    </div>
  );
}

function OrgCard({ org, onChanged }: { org: OrgRow; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: org.name,
    legalName: org.legalName ?? "",
    siren: org.siren ?? "",
    siret: org.siret ?? "",
    vatNumber: org.vatNumber ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newUnit, setNewUnit] = useState("");

  async function saveOrg() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/organizations/${org.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSaving(false);
    setMsg(res.ok ? "Enregistré." : json.error || "Erreur");
    if (res.ok) onChanged();
  }

  async function addUnit() {
    if (!newUnit.trim()) return;
    const res = await fetch("/api/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newUnit.trim(), organizationId: org.id }),
    });
    if (res.ok) {
      setNewUnit("");
      onChanged();
    }
  }

  async function deleteUnit(id: string) {
    const res = await fetch(`/api/units/${id}`, { method: "DELETE" });
    if (res.ok) onChanged();
    else {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error || "Suppression impossible (unité non vide ?)");
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1">
          <Label className="text-xs">Nom</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Raison sociale</Label>
          <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">SIREN (9 chiffres)</Label>
          <Input value={form.siren} onChange={(e) => setForm({ ...form, siren: e.target.value })} placeholder="ex : 732829320" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">SIRET siège</Label>
          <Input value={form.siret} onChange={(e) => setForm({ ...form, siret: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">N° TVA</Label>
          <Input value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} className="mt-1" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={saveOrg} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? "..." : "Enregistrer"}
        </Button>
        {msg && <span className={`text-sm ${msg === "Enregistré." ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
      </div>

      {/* Unités */}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Unités ({org.units.length})</h4>
        <div className="space-y-1.5">
          {org.units.map((u) => (
            <div key={u.id} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{u.name}</span>
                <span className="text-gray-400 ml-2">{u._count?.stores ?? 0} magasin(s)</span>
              </span>
              <button
                title="Supprimer l'unité"
                onClick={() => deleteUnit(u.id)}
                className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {org.units.length === 0 && <p className="text-xs text-gray-400">Aucune unité.</p>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            placeholder="Nom de l'unité (ex : Île-de-France)"
            className="h-8 w-64"
          />
          <Button size="sm" variant="outline" className="h-8" onClick={addUnit} disabled={!newUnit.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}
