"use client";

import { useState } from "react";
import { track } from "@/app/wesley/analytics";

// "Je veux The Wesley dans ma ville" — capture de demande d’expansion (V1).
// La donnée nourrit le futur "Dashboard géographique / score d’ouverture".
export default function VillePage() {
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/wesley/city-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, email }),
      });
      if (!res.ok) throw new Error("Échec de l’envoi");
      track("city_request", { city });
      setSent(true);
    } catch {
      setError("Oups, réessaie dans un instant.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-3xl font-black">Je veux The Wesley dans ma ville</h1>
      <p className="mt-2 text-gray-600">
        Dis-nous où ouvrir le prochain magasin. Plus il y a de demandes pour une ville, plus elle
        monte dans notre radar d’ouverture.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl bg-green-50 p-6 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-2 font-semibold text-green-800">Merci ! Ta demande pour {city} est enregistrée.</p>
          <p className="text-sm text-green-700">On te préviendra si un magasin ouvre près de chez toi.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium">Ta ville</label>
            <input
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Lille, Bruxelles, Toulouse…"
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Ton email (optionnel)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pour être prévenue de l’ouverture"
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-pink-600 px-6 py-3 font-semibold text-white hover:bg-pink-700 disabled:opacity-60"
          >
            {loading ? "Envoi…" : "Envoyer ma demande"}
          </button>
          <p className="text-xs text-gray-400">
            En envoyant, tu acceptes que The Wesley utilise ces infos pour évaluer la demande
            d’ouverture. Voir la{" "}
            <a href="/wesley/confidentialite" className="underline">politique de confidentialité</a>.
          </p>
        </form>
      )}
    </div>
  );
}
