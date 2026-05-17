"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const DAYS = [
  { dow: 1, label: "Lundi" },
  { dow: 2, label: "Mardi" },
  { dow: 3, label: "Mercredi" },
  { dow: 4, label: "Jeudi" },
  { dow: 5, label: "Vendredi" },
  { dow: 6, label: "Samedi" },
  { dow: 0, label: "Dimanche" },
];

interface DaySchedule {
  closed: boolean;
  openTime: string;
  closeTime: string;
}

export default function OnboardingStoresPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [schedules, setSchedules] = useState<Record<number, DaySchedule>>(
    Object.fromEntries(
      DAYS.map((d) => [
        d.dow,
        { closed: d.dow === 0, openTime: "09:00", closeTime: "19:00" },
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateDay(dow: number, patch: Partial<DaySchedule>) {
    setSchedules((s) => ({ ...s, [dow]: { ...s[dow], ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom du site est obligatoire");
      return;
    }
    setSaving(true);
    setError("");

    const schedulesPayload = DAYS.map((d) => ({
      dayOfWeek: d.dow,
      closed: schedules[d.dow].closed,
      openTime: schedules[d.dow].closed ? null : schedules[d.dow].openTime,
      closeTime: schedules[d.dow].closed ? null : schedules[d.dow].closeTime,
    }));

    try {
      const res = await fetch("/api/onboarding/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
          city: city.trim() || null,
          schedules: schedulesPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la création du site");
        setSaving(false);
        return;
      }
      router.push("/onboarding/employees");
    } catch {
      setError("Erreur réseau");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Votre premier site</h1>
        <p className="text-sm text-gray-500">
          Créez le site (magasin, restaurant, bureau...) où vos employés travaillent.
          Vous pourrez en ajouter d&apos;autres plus tard.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Nom du site <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Paris République"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Adresse <span className="text-gray-400">(optionnel)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="12 rue de la République"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Ville <span className="text-gray-400">(optionnel)</span>
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Paris"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">Horaires d&apos;ouverture</h2>
          <p className="text-xs text-gray-500">
            Vous pourrez modifier ces horaires plus tard.
          </p>
        </div>
        <div className="space-y-2">
          {DAYS.map((d) => {
            const s = schedules[d.dow];
            return (
              <div key={d.dow} className="flex items-center gap-3 py-1.5 border-t border-gray-100">
                <div className="w-24 text-sm font-medium text-gray-700">{d.label}</div>
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={s.closed}
                    onChange={(e) => updateDay(d.dow, { closed: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Fermé
                </label>
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    type="time"
                    value={s.openTime}
                    onChange={(e) => updateDay(d.dow, { openTime: e.target.value })}
                    disabled={s.closed}
                    className="px-2 py-1 border border-gray-200 rounded text-sm disabled:bg-gray-50 disabled:text-gray-300"
                  />
                  <span className="text-gray-300">→</span>
                  <input
                    type="time"
                    value={s.closeTime}
                    onChange={(e) => updateDay(d.dow, { closeTime: e.target.value })}
                    disabled={s.closed}
                    className="px-2 py-1 border border-gray-200 rounded text-sm disabled:bg-gray-50 disabled:text-gray-300"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Création…</>
          ) : (
            "Continuer →"
          )}
        </Button>
      </div>
    </form>
  );
}
