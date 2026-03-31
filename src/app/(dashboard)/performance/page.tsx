"use client";

import { useState } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, Trophy, User, AlertTriangle, Euro, ChevronRight } from "lucide-react";
import DashboardTab from "@/components/analytics/dashboard-tab";
import RankingTab from "@/components/analytics/ranking-tab";
import EmployeeDetailTab from "@/components/analytics/employee-detail-tab";
import AlertsTab from "@/components/analytics/alerts-tab";

export default function PerformancePage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [storeId, setStoreId] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics & Performance</h1>
            <p className="text-sm text-gray-500 mt-0.5">Scores, classements, ventes, productivité</p>
          </div>
        </div>
        <Link
          href="/costs"
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Euro className="h-4 w-4" />
          Coûts employeur
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date début</label>
          <input
            type="date"
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label>
          <input
            type="date"
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Magasin (optionnel)</label>
          <input
            type="text"
            placeholder="ID du magasin"
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="classement" className="gap-2">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Classement</span>
          </TabsTrigger>
          <TabsTrigger value="employe" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Employé</span>
          </TabsTrigger>
          <TabsTrigger value="alertes" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Alertes</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab dateFrom={dateFrom} dateTo={dateTo} storeId={storeId || undefined} />
        </TabsContent>

        <TabsContent value="classement">
          <RankingTab dateFrom={dateFrom} dateTo={dateTo} storeId={storeId || undefined} />
        </TabsContent>

        <TabsContent value="employe">
          <EmployeeDetailTab dateFrom={dateFrom} dateTo={dateTo} storeId={storeId || undefined} />
        </TabsContent>

        <TabsContent value="alertes">
          <AlertsTab dateFrom={dateFrom} dateTo={dateTo} storeId={storeId || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
