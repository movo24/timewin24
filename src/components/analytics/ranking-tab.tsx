"use client";

import { useEffect, useState } from "react";
import { Loader2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreBadge, ScoreValue, getPerformanceLevel } from "@/components/analytics/score-badge";
import { cn } from "@/lib/utils";

interface RankingTabProps {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}

interface EmployeeRanking {
  id: string;
  name: string;
  storeName: string;
  overallScore: number;
  salesScore: number;
  productivityScore: number;
  upsellScore: number;
  disciplineScore: number;
  inventoryScore: number;
}

type SortField = "overallScore" | "salesScore" | "productivityScore" | "upsellScore" | "disciplineScore" | "inventoryScore";

const PAGE_SIZE = 15;

const COLUMNS: { key: SortField; label: string }[] = [
  { key: "overallScore", label: "Score" },
  { key: "salesScore", label: "Ventes" },
  { key: "productivityScore", label: "Productivité" },
  { key: "upsellScore", label: "Upsell" },
  { key: "disciplineScore", label: "Discipline" },
  { key: "inventoryScore", label: "Inventaire" },
];

export default function RankingTab({ dateFrom, dateTo, storeId }: RankingTabProps) {
  const [employees, setEmployees] = useState<EmployeeRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("overallScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ dateFrom, dateTo });
        if (storeId) params.set("storeId", storeId);
        const res = await fetch(`/api/analytics/employees?${params}`);
        if (!res.ok) throw new Error("Erreur lors du chargement");
        const json = await res.json();
        setEmployees(json.employees || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [dateFrom, dateTo, storeId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(0);
  };

  const sorted = [...employees].sort((a, b) => {
    const diff = a[sortField] - b[sortField];
    return sortDir === "desc" ? -diff : diff;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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

  if (employees.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        Aucune donnée
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-10">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Employé</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Magasin</th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 font-medium text-gray-500 text-center cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortField === col.key ? (
                        sortDir === "desc" ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronUp className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 text-gray-300" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 font-medium text-gray-500 text-center">Badge</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((emp, idx) => (
                <tr
                  key={emp.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {page * PAGE_SIZE + idx + 1}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{emp.storeName}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-center">
                      {col.key === "overallScore" ? (
                        <span className="font-bold">
                          <ScoreValue score={emp[col.key]} />
                        </span>
                      ) : (
                        <span className="text-gray-700">{emp[col.key].toFixed(0)}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge level={getPerformanceLevel(emp.overallScore)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {employees.length} employé{employees.length > 1 ? "s" : ""} au total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Précédent
            </Button>
            <span className="text-sm text-gray-500">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
