"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Session {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  employee: { firstName: string; lastName: string };
  _count: { counts: number };
}

export default function InventoryHistoryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("inventory_token");
    if (!token) { router.push("/inventory/login"); return; }

    fetch("/api/inventory/history", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => router.push("/inventory/home")} className="text-gray-400 hover:text-white">
          &larr;
        </button>
        <h1 className="text-xl font-bold">Historique inventaires</h1>
      </div>

      {loading ? (
        <p className="text-gray-400 text-center">Chargement...</p>
      ) : sessions.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
          <p className="text-gray-400">Aucun inventaire termin&eacute;</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{s._count.counts} produits scann&eacute;s</p>
                  <p className="text-sm text-gray-400">
                    {s.employee.firstName} {s.employee.lastName}
                  </p>
                </div>
                <span className="bg-emerald-900 text-emerald-300 text-xs px-2 py-1 rounded">
                  Termin&eacute;
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                <p>D&eacute;but : {new Date(s.startedAt).toLocaleString("fr-FR")}</p>
                {s.completedAt && <p>Fin : {new Date(s.completedAt).toLocaleString("fr-FR")}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
