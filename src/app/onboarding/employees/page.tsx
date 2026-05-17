"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Store {
  id: string;
  name: string;
}

export default function OnboardingEmployeesPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [storeId, setStoreId] = useState("");
  const [weeklyHours, setWeeklyHours] = useState<string>("35");
  const [contractType, setContractType] = useState<string>("CDI");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdCount, setCreatedCount] = useState(0);

  useEffect(() => {
    fetch("/api/stores?limit=50")
      .then((r) => r.json())
      .then((data) => {
        const list = data?.stores ?? [];
        setStores(list);
        if (list.length > 0) setStoreId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setWeeklyHours("35");
    setContractType("CDI");
  }

  async function handleAddOne(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Prénom et nom requis");
      return;
    }
    if (!storeId) {
      setError("Sélectionnez un site");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          storeId,
          weeklyHours: weeklyHours ? Number(weeklyHours) : null,
          contractType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'ajout");
        setSaving(false);
        return;
      }
      setCreatedCount((c) => c + 1);
      resetForm();
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  async function goToFinish() {
    if (createdCount === 0) {
      setError("Ajoutez au moins un employé avant de continuer");
      return;
    }
    router.push("/onboarding/done");
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Votre premier employé</h1>
        <p className="text-sm text-gray-500">
          Ajoutez au moins un employé. Vous pourrez en créer d&apos;autres après l&apos;onboarding.
        </p>
        {createdCount > 0 && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 mt-3">
            ✅ {createdCount} employé{createdCount > 1 ? "s" : ""} ajouté{createdCount > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <form onSubmit={handleAddOne} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Prénom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Email <span className="text-gray-400">(optionnel)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="employe@exemple.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
          <p className="text-xs text-gray-400">
            Utilisé pour envoyer le planning par email à cet employé.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Site</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Type contrat</label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
            >
              <option value="CDI">CDI</option>
              <option value="CDD">CDD</option>
              <option value="INTERIM">Intérim</option>
              <option value="EXTRA">Extra</option>
              <option value="STAGE">Stage</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Heures/sem.</label>
            <input
              type="number"
              min="0"
              max="60"
              step="0.5"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <Button type="submit" variant="outline" disabled={saving || !firstName.trim() || !lastName.trim()}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Ajout…</>
            ) : (
              <><UserPlus className="h-4 w-4 mr-1.5" />Ajouter cet employé</>
            )}
          </Button>
          <Button type="button" onClick={goToFinish} disabled={createdCount === 0} className="ml-auto">
            {createdCount === 0 ? "Ajoutez d'abord un employé" : (
              <>Continuer<ArrowRight className="h-4 w-4 ml-1.5" /></>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
