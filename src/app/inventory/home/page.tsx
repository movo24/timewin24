"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface StoreInfo {
  id: string;
  name: string;
  storeCode: string;
  city: string;
}

interface EmployeeInfo {
  firstName: string;
  lastName: string;
  employeeCode: string;
}

export default function InventoryHomePage() {
  const router = useRouter();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("inventory_token");
    if (!token) {
      router.push("/inventory/login");
      return;
    }
    try {
      setStore(JSON.parse(localStorage.getItem("inventory_store") || "null"));
      setEmployee(JSON.parse(localStorage.getItem("inventory_employee") || "null"));
    } catch {
      router.push("/inventory/login");
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("inventory_token");
    localStorage.removeItem("inventory_employee");
    localStorage.removeItem("inventory_store");
    router.push("/inventory/login");
  }

  if (!store || !employee) return null;

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold">Inventaire</h1>
          <p className="text-sm text-gray-400">
            {store.name} ({store.storeCode})
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-red-400 transition-colors"
        >
          D&eacute;connexion
        </button>
      </div>

      {/* Employee info */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
        <p className="text-sm text-gray-400">Connect&eacute; en tant que</p>
        <p className="font-semibold">{employee.firstName} {employee.lastName}</p>
        <p className="text-xs text-gray-500">{employee.employeeCode}</p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-4">
        <Link
          href="/inventory/scan"
          className="flex items-center gap-4 bg-emerald-900/30 border border-emerald-800 rounded-xl p-5 hover:bg-emerald-900/50 transition-colors"
        >
          <div className="w-12 h-12 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Scanner des produits</p>
            <p className="text-sm text-gray-400">Scan code-barres + saisie quantit&eacute;</p>
          </div>
        </Link>

        <Link
          href="/inventory/counts"
          className="flex items-center gap-4 bg-blue-900/30 border border-blue-800 rounded-xl p-5 hover:bg-blue-900/50 transition-colors"
        >
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Comptages en cours</p>
            <p className="text-sm text-gray-400">Sessions d'inventaire actives</p>
          </div>
        </Link>

        <Link
          href="/inventory/history"
          className="flex items-center gap-4 bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:bg-gray-800 transition-colors"
        >
          <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Historique</p>
            <p className="text-sm text-gray-400">Sessions d'inventaire termin&eacute;es</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
