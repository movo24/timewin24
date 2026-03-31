"use client";

import { useEffect, useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Loader2, Clock, CheckCircle, AlertTriangle, TimerOff } from "lucide-react";
import KpiCard from "@/components/analytics/kpi-card";
import ChartWrapper from "@/components/analytics/chart-wrapper";
import { ScoreBadge, getPerformanceLevel } from "@/components/analytics/score-badge";

interface EmployeeDetailTabProps {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}

interface EmployeeOption {
  id: string;
  name: string;
}

interface EmployeeDetail {
  id: string;
  name: string;
  storeName: string;
  scores: {
    overall: number;
    sales: number;
    productivity: number;
    upsell: number;
    discipline: number;
    inventory: number;
  };
  dailyPerformance: { date: string; totalSales: number }[];
  hourlyActivity: { hour: number; avgSales: number }[];
  attendance: {
    punctualityRate: number;
    presenceRate: number;
    totalHours: number;
    lateCount: number;
  };
}

export default function EmployeeDetailTab({ dateFrom, dateTo, storeId }: EmployeeDetailTabProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch employee list
  useEffect(() => {
    async function fetchList() {
      setLoadingList(true);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (storeId) params.set("storeId", storeId);
        const res = await fetch(`/api/analytics/employees?${params}`);
        if (!res.ok) throw new Error("Erreur lors du chargement");
        const json = await res.json();
        const list = (json.employees || []).map((e: { id: string; name: string }) => ({
          id: e.id,
          name: e.name,
        }));
        setEmployees(list);
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoadingList(false);
      }
    }
    fetchList();
  }, [dateFrom, dateTo, storeId]);

  // Fetch employee detail
  useEffect(() => {
    if (!selectedId) return;
    async function fetchDetail() {
      setLoadingDetail(true);
      setError(null);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (storeId) params.set("storeId", storeId);
        const res = await fetch(`/api/analytics/employees/${selectedId}?${params}`);
        if (!res.ok) throw new Error("Erreur lors du chargement");
        const json = await res.json();
        setDetail(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoadingDetail(false);
      }
    }
    fetchDetail();
  }, [selectedId, dateFrom, dateTo, storeId]);

  if (loadingList) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        Aucun employé trouvé
      </div>
    );
  }

  const radarData = detail
    ? [
        { axis: "Ventes", value: detail.scores.sales },
        { axis: "Productivité", value: detail.scores.productivity },
        { axis: "Upsell", value: detail.scores.upsell },
        { axis: "Discipline", value: detail.scores.discipline },
        { axis: "Inventaire", value: detail.scores.inventory },
      ]
    : [];

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);

  return (
    <div className="space-y-6">
      {/* Employee selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sélectionner un employé
        </label>
        <select
          className="w-full md:w-80 h-9 rounded-md border border-gray-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
      </div>

      {loadingDetail ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20 text-sm text-red-500">
          {error}
        </div>
      ) : detail ? (
        <>
          {/* Score summary + Radar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{detail.name}</h3>
                  <p className="text-sm text-gray-500">{detail.storeName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold text-gray-900">
                    {detail.scores.overall.toFixed(0)}
                  </span>
                  <ScoreBadge level={getPerformanceLevel(detail.scores.overall)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Ventes", value: detail.scores.sales },
                  { label: "Productivité", value: detail.scores.productivity },
                  { label: "Upsell", value: detail.scores.upsell },
                  { label: "Discipline", value: detail.scores.discipline },
                  { label: "Inventaire", value: detail.scores.inventory },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className="text-sm font-bold text-gray-900">{item.value.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>

            <ChartWrapper title="Profil de performance" loading={false} empty={radarData.length === 0}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ChartWrapper>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartWrapper
              title="Tendance de performance quotidienne"
              loading={false}
              empty={detail.dailyPerformance.length === 0}
            >
              <LineChart data={detail.dailyPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Ventes"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="totalSales"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Ventes"
                />
              </LineChart>
            </ChartWrapper>

            <ChartWrapper
              title="Activité horaire moyenne"
              loading={false}
              empty={detail.hourlyActivity.length === 0}
            >
              <AreaChart data={detail.hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h) => `${h}h`} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(h) => `${h}h`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="avgSales"
                  stroke="#10b981"
                  fill="#d1fae5"
                  strokeWidth={2}
                  name="Ventes moy."
                />
              </AreaChart>
            </ChartWrapper>
          </div>

          {/* Attendance stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={CheckCircle}
              label="Ponctualité"
              value={`${detail.attendance.punctualityRate.toFixed(1)}%`}
              color="emerald"
            />
            <KpiCard
              icon={Clock}
              label="Présence"
              value={`${detail.attendance.presenceRate.toFixed(1)}%`}
              color="blue"
            />
            <KpiCard
              icon={TimerOff}
              label="Heures totales"
              value={`${detail.attendance.totalHours.toFixed(0)}h`}
              color="purple"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Retards"
              value={detail.attendance.lateCount.toString()}
              color="amber"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
