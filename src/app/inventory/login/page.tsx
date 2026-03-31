"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InventoryLoginPage() {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/inventory/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeIdentifier: employeeId,
          storeIdentifier: storeId,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur de connexion");
        setLoading(false);
        return;
      }

      // Store JWT and session info
      localStorage.setItem("inventory_token", data.token);
      localStorage.setItem("inventory_employee", JSON.stringify(data.employee));
      localStorage.setItem("inventory_store", JSON.stringify(data.store));

      router.push("/inventory/home");
    } catch {
      setError("Erreur de connexion au serveur");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-600 rounded-xl mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">Inventaire</h1>
            <p className="text-sm text-gray-400 mt-1">TimeWin &mdash; Application terrain</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Identifiant employ&eacute;
              </label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="email ou code employ&eacute;"
                required
                className="w-full h-11 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Identifiant magasin
              </label>
              <input
                type="text"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                placeholder="code magasin (ex: GDN-PARIS-001)"
                required
                className="w-full h-11 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                required
                className="w-full h-11 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
