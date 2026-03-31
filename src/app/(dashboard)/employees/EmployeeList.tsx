"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, ChevronLeft, ChevronRight, Euro, CalendarOff, BarChart3 } from "lucide-react";
import { ScoreBadge, ScoreBar } from "@/components/reliability-score";
import {
  Employee,
  CONTRACT_LABELS,
  SKILL_LABELS,
  SHIFT_PREF_LABELS,
  DAY_NAMES,
  calcCostPerHour,
} from "./types";

interface Props {
  employees: Employee[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onEdit: (emp: Employee) => void;
  onDelete: (emp: Employee) => void;
  onScoreDetail: (emp: Employee) => void;
}

export default function EmployeeList({ employees, page, totalPages, onPageChange, onEdit, onDelete, onScoreDetail }: Props) {
  return (
    <>
      {/* Mobile card layout */}
      <div className="space-y-3 lg:hidden">
        {employees.map((emp) => {
          const cost = emp.costConfig;
          const costPerHour = cost
            ? calcCostPerHour(cost.hourlyRateGross, cost.country, cost.employerRateOverride)
            : null;

          return (
            <div key={emp.id} className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 truncate">
                      {emp.firstName} {emp.lastName}
                    </span>
                    <Badge variant={emp.active ? "success" : "secondary"} className="shrink-0 text-[10px]">
                      {emp.active ? "Actif" : "Inactif"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{emp.email}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(emp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(emp)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                <div className="bg-gray-50 rounded px-2 py-1.5">
                  <span className="text-gray-400 block">h/sem</span>
                  <span className="font-medium text-gray-700">{emp.weeklyHours ?? "—"}</span>
                </div>
                <div className="bg-gray-50 rounded px-2 py-1.5">
                  <span className="text-gray-400 block">Brut/h</span>
                  <span className="font-medium text-gray-700 font-mono">
                    {cost ? `${cost.hourlyRateGross.toFixed(2)}€` : "—"}
                  </span>
                </div>
                <div className="bg-emerald-50 rounded px-2 py-1.5">
                  <span className="text-emerald-500 block">Chargé/h</span>
                  <span className="font-semibold text-emerald-700 font-mono">
                    {costPerHour != null ? `${costPerHour.toFixed(2)}€` : "—"}
                  </span>
                </div>
                <button
                  onClick={() => onScoreDetail(emp)}
                  className="bg-gray-50 rounded px-2 py-1.5 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="text-gray-400 block">Fiabilité</span>
                  <ScoreBadge score={emp.reliabilityScore} profile={emp.profileCategory as "A" | "B" | "C" | null} />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {emp.contractType && (
                  <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                    {CONTRACT_LABELS[emp.contractType] || emp.contractType}
                  </Badge>
                )}
                {emp.shiftPreference && emp.shiftPreference !== "JOURNEE" && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                    {SHIFT_PREF_LABELS[emp.shiftPreference] || emp.shiftPreference}
                  </Badge>
                )}
                {emp.skills?.map((skill) => (
                  <Badge key={skill} variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">
                    {SKILL_LABELS[skill] || skill}
                  </Badge>
                ))}
                {emp.unavailabilities?.filter((u) => u.type === "FIXED").length > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">
                    <CalendarOff className="h-2.5 w-2.5 mr-0.5" />
                    {emp.unavailabilities.filter((u) => u.type === "FIXED").map((u) => DAY_NAMES[u.dayOfWeek ?? 0]).join(", ")}
                  </Badge>
                )}
              </div>

              {(emp.costConfig?.fixedMissionCost != null || emp.stores.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  {emp.costConfig?.fixedMissionCost != null && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
                      <Euro className="h-3 w-3" />
                      Mission: {emp.costConfig.fixedMissionCost.toFixed(2)}€
                    </span>
                  )}
                  {emp.stores.map((s) => (
                    <Badge key={s.store.id} variant="outline" className="text-[10px]">
                      {s.store.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {employees.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            Aucun employé trouvé
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Desktop table layout */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">h/sem</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1"><Euro className="h-3.5 w-3.5" />Brut/h</span>
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Fixe mission</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1"><Euro className="h-3.5 w-3.5" />Chargé/h</span>
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Fiabilité</span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Boutiques</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const cost = emp.costConfig;
                const costPerHour = cost
                  ? calcCostPerHour(cost.hourlyRateGross, cost.country, cost.employerRateOverride)
                  : null;

                return (
                  <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{emp.firstName} {emp.lastName}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.email}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={emp.active ? "success" : "secondary"}>{emp.active ? "Actif" : "Inactif"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{emp.weeklyHours ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {cost ? <span className="text-gray-900">{cost.hourlyRateGross.toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {cost?.fixedMissionCost != null ? <span className="text-gray-900">{cost.fixedMissionCost.toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {costPerHour != null ? <span className="font-semibold text-emerald-700">{costPerHour.toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => onScoreDetail(emp)} className="hover:opacity-70 transition-opacity">
                        <ScoreBar score={emp.reliabilityScore} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {emp.stores.map((s) => (
                          <Badge key={s.store.id} variant="outline">{s.store.name}</Badge>
                        ))}
                        {emp.stores.length === 0 && <span className="text-gray-400">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => onEdit(emp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(emp)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Aucun employé trouvé</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
