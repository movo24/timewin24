"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OnboardingCompanyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [country, setCountry] = useState("FR");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [language, setLanguage] = useState("fr");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom de la société est obligatoire");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          country,
          timezone,
          language,
          contactEmail: contactEmail.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'enregistrement");
        setSaving(false);
        return;
      }
      router.push("/onboarding/stores");
    } catch {
      setError("Erreur réseau");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Bienvenue sur TimeWin24
        </h1>
        <p className="text-sm text-gray-500">
          Quelques infos sur votre société pour commencer.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Nom de la société <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Boulangerie Lévy"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Pays</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
            >
              <option value="FR">France</option>
              <option value="BE">Belgique</option>
              <option value="CH">Suisse</option>
              <option value="LU">Luxembourg</option>
              <option value="MC">Monaco</option>
              <option value="ES">Espagne</option>
              <option value="DE">Allemagne</option>
              <option value="IT">Italie</option>
              <option value="GB">Royaume-Uni</option>
              <option value="US">États-Unis</option>
              <option value="CA">Canada</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Langue</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Fuseau horaire</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
          >
            <option value="Europe/Paris">Europe/Paris (CET)</option>
            <option value="Europe/Brussels">Europe/Brussels</option>
            <option value="Europe/Zurich">Europe/Zurich</option>
            <option value="Europe/London">Europe/London</option>
            <option value="Europe/Madrid">Europe/Madrid</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Email de contact <span className="text-gray-400">(optionnel)</span>
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="contact@masociete.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
          <p className="text-xs text-gray-400">
            Utilisé pour les communications importantes (factures, sécurité).
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Enregistrement…</>
          ) : (
            "Continuer →"
          )}
        </Button>
      </div>
    </form>
  );
}
