"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Session {
  id: string;
  status: string;
  startedAt: string;
  notes: string | null;
  employee: { firstName: string; lastName: string };
  _count: { counts: number };
}

export default function InventoryCountsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("inventory_token");
    if (!token) { router.push("/inventory/login"); return; }

    fetch("/api/inventory/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setSessions((data.sessions || []).filter((s: Session) => s.status === "IN_PROGRESS"));
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
        <h1 className="text-xl font-bold">Comptages en cours</h1>
      </div>

      {loading ? (
        <p className="text-gray-400 text-center">Chargement...</p>
      ) : sessions.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
          <p className="text-gray-400">Aucune session en cours</p>
          <button
            onClick={() => router.push("/inventory/scan")}
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg"
          >
            D&eacute;marrer un inventaire
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">Session</p>
                  <p className="text-xs text-gray-500 font-mono">{s.id.slice(0, 12)}...</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {s.employee.firstName} {s.employee.lastName}
                  </p>
                </div>
                <div className="text-right">
                  <span className="bg-yellow-900 text-yellow-300 text-xs px-2 py-1 rounded">
                    En cours
                  </span>
                  <p className="text-sm text-gray-400 mt-1">{s._count.counts} scans</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                D&eacute;but : {new Date(s.startedAt).toLocaleString("fr-FR")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
