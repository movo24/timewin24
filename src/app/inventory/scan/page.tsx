"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface ScanEntry {
  id: string;
  barcode: string;
  productName: string | null;
  quantity: number;
  scannedAt: string;
}

export default function InventoryScanPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [productName, setProductName] = useState("");
  const [scans, setScans] = useState<ScanEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = localStorage.getItem("inventory_token");
    if (!t) { router.push("/inventory/login"); return; }
    setToken(t);
  }, [router]);

  async function apiFetch(path: string, opts?: RequestInit) {
    return fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...opts?.headers,
      },
    });
  }

  async function startSession() {
    setLoading(true);
    const res = await apiFetch("/api/inventory/sessions", { method: "POST", body: JSON.stringify({}) });
    const data = await res.json();
    if (res.ok) {
      setSessionId(data.id);
    } else {
      setError(data.error || "Erreur");
    }
    setLoading(false);
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !barcode.trim()) return;
    setError("");

    const res = await apiFetch("/api/inventory/scan", {
      method: "POST",
      body: JSON.stringify({ sessionId, barcode: barcode.trim(), productName: productName.trim() || undefined, quantity }),
    });
    const data = await res.json();

    if (res.ok) {
      setScans((prev) => [data, ...prev]);
      setBarcode("");
      setProductName("");
      setQuantity(1);
      barcodeRef.current?.focus();
    } else {
      setError(data.error || "Erreur scan");
    }
  }

  async function completeSession() {
    if (!sessionId) return;
    const res = await apiFetch("/api/inventory/history", {
      method: "PATCH",
      body: JSON.stringify({ sessionId, action: "complete" }),
    });
    if (res.ok) {
      router.push("/inventory/home");
    }
  }

  if (!token) return null;

  // Step 1: Start session
  if (!sessionId) {
    return (
      <div className="min-h-screen p-4 max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => router.push("/inventory/home")} className="text-gray-400 hover:text-white">
            &larr;
          </button>
          <h1 className="text-xl font-bold">Scanner des produits</h1>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
          <p className="text-gray-400 mb-4">D&eacute;marrer une nouvelle session d&apos;inventaire pour commencer &agrave; scanner.</p>
          <button
            onClick={startSession}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-3 rounded-lg disabled:opacity-50"
          >
            {loading ? "Cr&eacute;ation..." : "D&eacute;marrer la session"}
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Scan mode
  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Scan en cours</h1>
        <button
          onClick={completeSession}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Terminer ({scans.length})
        </button>
      </div>

      <form onSubmit={handleScan} className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-4 space-y-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Code-barres</label>
          <input
            ref={barcodeRef}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scanner ou saisir le code-barres"
            autoFocus
            required
            className="w-full h-12 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 text-lg font-mono placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Nom produit (optionnel)</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Description"
              className="w-full h-10 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="w-24">
            <label className="block text-sm text-gray-400 mb-1">Qt&eacute;</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full h-10 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 text-center focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg"
        >
          Enregistrer
        </button>
      </form>

      {/* Scan list */}
      <div className="space-y-2">
        {scans.map((s) => (
          <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex justify-between items-center">
            <div>
              <p className="font-mono text-sm">{s.barcode}</p>
              {s.productName && <p className="text-xs text-gray-400">{s.productName}</p>}
            </div>
            <span className="bg-emerald-900 text-emerald-300 text-sm font-semibold px-2 py-1 rounded">
              x{s.quantity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
