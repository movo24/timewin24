"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { DollarSign, ShoppingCart, Receipt, Clock, Users, Loader2 } from "lucide-react";
import KpiCard from "@/components/analytics/kpi-card";
import ChartWrapper from "@/components/analytics/chart-wrapper";

interface DashboardTabProps {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}

interface DashboardData {
  kpis: {
    totalRevenue: number;
    totalTransactions: number;
    avgBasket: number;
    revenuePerHour: number;
    totalHours: number;
    cashAmount: number;
    cardAmount: number;
    otherAmount: number;
    employeeCount: number;
  };
  dailyTrend: { date: string; revenue: number; transactions: number; hours: number }[];
  topEmployees: { employeeId: string; employeeName: string; employeeCode: string; overallScore: number; badge: string; rank: number }[];
  hourlyDistribution: { hour: number; revenue: number; transactions: number }[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

export default function DashboardTab({ dateFrom, dateTo, storeId }: DashboardTabProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (storeId) params.set("storeId", storeId);
        const res = await fetch(`/api/analytics/dashboard?${params}`);
        if (!res.ok) throw new Error("Erreur lors du chargement");
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [dateFrom, dateTo, storeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        Aucune donnée
      </div>
    );
  }

  const { kpis } = data;
  const dailyTrend = data.dailyTrend || [];
  const topEmployees = data.topEmployees || [];
  const hourlyDistribution = data.hourlyDistribution || [];

  // Build payment breakdown from KPIs
  const paymentData = [
    { type: "CB", value: kpis.cardAmount || 0 },
    { type: "Espèces", value: kpis.cashAmount || 0 },
    { type: "Autre", value: kpis.otherAmount || Math.max(0, (kpis.totalRevenue || 0) - (kpis.cardAmount || 0) - (kpis.cashAmount || 0)) },
  ].filter(p => p.value > 0);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          icon={DollarSign}
          label="CA Total"
          value={formatCurrency(kpis.totalRevenue)}
          trend={undefined}
          color="blue"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Transactions"
          value={kpis.totalTransactions.toLocaleString("fr-FR")}
          trend={undefined}
          color="emerald"
        />
        <KpiCard
          icon={Receipt}
          label="Panier Moyen"
          value={formatCurrency(kpis.avgBasket || 0)}
          trend={undefined}
          color="amber"
        />
        <KpiCard
          icon={Clock}
          label="CA / Heure"
          value={formatCurrency(kpis.revenuePerHour)}
          color="purple"
        />
        <KpiCard
          icon={Users}
          label="Heures Travaillées"
          value={`${(kpis.totalHours || 0).toFixed(0)}h`}
          color="rose"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="CA par jour"
          loading={false}
          empty={dailyTrend.length === 0}
        >
          <LineChart data={dailyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), "CA"]}
              contentStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="CA"
            />
          </LineChart>
        </ChartWrapper>

        <ChartWrapper
          title="Top 10 employés par CA"
          loading={false}
          empty={topEmployees.length === 0}
        >
          <BarChart data={topEmployees} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="employeeName" type="category" width={100} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => [Number(value).toFixed(0), "Score"]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="overallScore" fill="#10b981" radius={[0, 4, 4, 0]} name="Score" />
          </BarChart>
        </ChartWrapper>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartWrapper
          title="Distribution horaire des ventes"
          loading={false}
          empty={hourlyDistribution.length === 0}
        >
          <AreaChart data={hourlyDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h) => `${h}h`} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(h) => `${h}h`}
              contentStyle={{ fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#f59e0b"
              fill="#fef3c7"
              strokeWidth={2}
              name="Ventes"
            />
          </AreaChart>
        </ChartWrapper>

        <ChartWrapper
          title="Répartition paiements"
          loading={false}
          empty={paymentData.length === 0}
          height={300}
        >
          <PieChart>
            <Pie
              data={paymentData}
              cx="50%"
              cy="50%"
              outerRadius={100}
              dataKey="value"
              nameKey="type"
              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {paymentData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend />
          </PieChart>
        </ChartWrapper>
      </div>
    </div>
  );
}
