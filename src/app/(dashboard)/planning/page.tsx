"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { StoreSearch } from "@/components/store-search";
import { WeekTimeline } from "@/components/planning/week-timeline";
import { DayTimeline } from "@/components/planning/day-timeline";
import { ShiftModal } from "@/components/planning/shift-modal";
import { getMondayOfWeek, formatDate, getDayNameFr, getWeekDays } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Plus,
  Calendar,
  CalendarDays,
  Clock,
  User,
  ZoomIn,
} from "lucide-react";
import Link from "next/link";

interface Shift {
  id: string;
  storeId: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
  store: { id: string; name: string };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    weeklyHours?: number | null;
  };
}

interface EmployeeForShift {
  id: string;
  firstName: string;
  lastName: string;
}

type ViewMode = "week" | "day";

const ZOOM_PRESETS = [
  { label: "Journée complète", start: 0, end: 24 },
  { label: "06h – 22h", start: 6, end: 22 },
  { label: "07h – 20h", start: 7, end: 20 },
  { label: "08h – 18h", start: 8, end: 18 },
  { label: "09h – 21h", start: 9, end: 21 },
  { label: "Matin (06h–14h)", start: 6, end: 14 },
  { label: "Après-midi (14h–22h)", start: 14, end: 22 },
];

export default function PlanningPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const employeeId = (session?.user as { employeeId?: string })?.employeeId;

  const [storeId, setStoreId] = useState("");
  const [weekStart, setWeekStart] = useState(getMondayOfWeek());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<EmployeeForShift[]>([]);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [defaultDate, setDefaultDate] = useState("");
  const [defaultStartTime, setDefaultStartTime] = useState("09:00");
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateMsg, setDuplicateMsg] = useState("");

  // View mode: week or day
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // Zoom: grid hours
  const [gridStartHour, setGridStartHour] = useState(6);
  const [gridEndHour, setGridEndHour] = useState(22);
  const [showZoomMenu, setShowZoomMenu] = useState(false);

  const loadShifts = useCallback(async () => {
    if (!isAdmin && !employeeId) return;

    let url = `/api/shifts?weekStart=${weekStart}`;
    if (isAdmin && storeId) {
      url += `&storeId=${storeId}`;
    } else if (!isAdmin && employeeId) {
      url += `&employeeId=${employeeId}`;
    }

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setShifts(data.shifts || []);
    }
  }, [weekStart, storeId, isAdmin, employeeId]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Load employees for the selected store (for shift creation)
  useEffect(() => {
    if (!isAdmin || !storeId) {
      setEmployees([]);
      return;
    }
    fetch(`/api/employees?storeId=${storeId}&active=true&limit=100`)
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees || []))
      .catch(() => {});
  }, [storeId, isAdmin]);

  function navigateWeek(direction: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7 * direction);
    setWeekStart(formatDate(d));
  }

  function goToToday() {
    setWeekStart(getMondayOfWeek());
    const today = new Date();
    const dayOfWeek = today.getDay();
    setSelectedDayIndex(dayOfWeek === 0 ? 6 : dayOfWeek - 1);
  }

  function handleShiftClick(shift: Shift) {
    if (!isAdmin) return;
    setEditingShift(shift as Shift);
    setDefaultDate("");
    setDefaultStartTime("09:00");
    setShiftModalOpen(true);
  }

  function handleAddShift(date: string, time?: string) {
    if (!isAdmin) return;
    setEditingShift(null);
    setDefaultDate(date);
    setDefaultStartTime(time || "09:00");
    setShiftModalOpen(true);
  }

  async function handleDuplicate() {
    if (!storeId) {
      alert("Sélectionnez d'abord une boutique");
      return;
    }
    if (!confirm("Dupliquer tous les shifts de cette semaine vers la semaine suivante ?"))
      return;

    setDuplicating(true);
    setDuplicateMsg("");

    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const res = await fetch("/api/shifts/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        sourceWeekStart: weekStart,
        targetWeekStart: formatDate(nextWeek),
      }),
    });

    const data = await res.json();
    setDuplicating(false);

    if (!res.ok) {
      setDuplicateMsg(`Erreur: ${data.error}`);
      return;
    }

    setDuplicateMsg(
      `${data.created} shift(s) créé(s), ${data.skipped} ignoré(s) (conflits)`
    );
    setTimeout(() => setDuplicateMsg(""), 5000);
  }

  function handleExport() {
    if (!storeId) {
      alert("Sélectionnez d'abord une boutique");
      return;
    }
    window.open(
      `/api/shifts/export?storeId=${storeId}&weekStart=${weekStart}`,
      "_blank"
    );
  }

  // Selected day for day view
  const weekDays = getWeekDays(weekStart);
  const selectedDay = weekDays[selectedDayIndex];
  const selectedDateStr = formatDate(selectedDay);

  // Format week label
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${new Date(weekStart).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })} - ${weekEnd.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  // Day label for day view
  const dayLabel = selectedDay.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Shift count for day view
  const dayShiftCount = shifts.filter((s) => {
    const key = typeof s.date === "string" ? s.date.split("T")[0] : formatDate(new Date(s.date));
    return key === selectedDateStr;
  }).length;

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "Planning" : "Mon Planning"}
        </h1>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
              <Copy className="h-4 w-4 mr-1.5" />
              {duplicating ? "Duplication..." : "Dupliquer semaine"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        )}
      </div>

      {/* Filters + controls */}
      <div className="space-y-3 mb-4">
        {isAdmin && (
          <div className="w-full lg:w-72">
            <StoreSearch
              value={storeId}
              onChange={setStoreId}
              placeholder="Sélectionner une boutique..."
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Week navigation */}
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 hidden sm:flex" onClick={goToToday}>
              <Calendar className="h-3.5 w-3.5 mr-1" />
              Aujourd&apos;hui
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 sm:hidden" onClick={goToToday}>
              <Calendar className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs sm:text-sm font-medium text-gray-700 text-center">
              {weekLabel}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigateWeek(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button
              className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 ${
                viewMode === "week"
                  ? "bg-white shadow-sm text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setViewMode("week")}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Semaine</span>
              <span className="sm:hidden">Sem.</span>
            </button>
            <button
              className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md transition-colors flex items-center gap-1 ${
                viewMode === "day"
                  ? "bg-white shadow-sm text-gray-900 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setViewMode("day")}
            >
              <Clock className="h-3.5 w-3.5" />
              Jour
            </button>
          </div>

          {/* Zoom control */}
          <div className="relative ml-auto sm:ml-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs sm:text-sm"
              onClick={() => setShowZoomMenu(!showZoomMenu)}
            >
              <ZoomIn className="h-3.5 w-3.5 mr-1" />
              {gridStartHour.toString().padStart(2, "0")}h–{gridEndHour.toString().padStart(2, "0")}h
            </Button>
            {showZoomMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowZoomMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-40 py-1 min-w-[180px]">
                  {ZOOM_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        gridStartHour === preset.start && gridEndHour === preset.end
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700"
                      }`}
                      onClick={() => {
                        setGridStartHour(preset.start);
                        setGridEndHour(preset.end);
                        setShowZoomMenu(false);
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Day picker (day view only) */}
      {viewMode === "day" && (
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
          {weekDays.map((day, idx) => {
            const dateStr = formatDate(day);
            const isSelected = idx === selectedDayIndex;
            const isToday = formatDate(new Date()) === dateStr;
            const shiftCount = shifts.filter((s) => {
              const key = typeof s.date === "string" ? s.date.split("T")[0] : formatDate(new Date(s.date));
              return key === dateStr;
            }).length;

            return (
              <button
                key={dateStr}
                className={`flex flex-col items-center px-4 py-2 rounded-lg transition-colors min-w-[64px] ${
                  isSelected
                    ? "bg-gray-900 text-white"
                    : isToday
                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
                onClick={() => setSelectedDayIndex(idx)}
              >
                <span className="text-[10px] uppercase font-medium opacity-80">
                  {getDayNameFr(idx)}
                </span>
                <span className="text-lg font-bold">{day.getUTCDate()}</span>
                {shiftCount > 0 && (
                  <span
                    className={`text-[10px] ${
                      isSelected ? "text-white/70" : "text-gray-400"
                    }`}
                  >
                    {shiftCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {duplicateMsg && (
        <div className="mb-4 text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-md p-3">
          {duplicateMsg}
        </div>
      )}

      {/* Main content */}
      {isAdmin && !storeId ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">
            Sélectionnez une boutique pour afficher le planning
          </p>
          <p className="text-sm text-gray-400">
            Ou consultez le{" "}
            <Link href="/employees" className="text-blue-600 hover:underline">
              planning par employé
            </Link>
          </p>
        </div>
      ) : (
        <>
          {/* Timeline view */}
          <div className="overflow-x-auto">
            {viewMode === "week" ? (
              <WeekTimeline
                weekStart={weekStart}
                shifts={shifts}
                onShiftClick={handleShiftClick}
                onAddShift={handleAddShift}
                mode={isAdmin ? "store" : "employee"}
                gridStartHour={gridStartHour}
                gridEndHour={gridEndHour}
              />
            ) : (
              <DayTimeline
                date={selectedDateStr}
                shifts={shifts}
                onShiftClick={handleShiftClick}
                onAddShift={handleAddShift}
                mode={isAdmin ? "store" : "employee"}
                gridStartHour={gridStartHour}
                gridEndHour={gridEndHour}
              />
            )}
          </div>

          {/* Quick stats */}
          <div className="mt-4 flex gap-4 text-sm text-gray-500">
            {viewMode === "week" ? (
              <>
                <span>{shifts.length} shift(s) cette semaine</span>
                {isAdmin && (
                  <span>
                    {new Set(shifts.map((s) => s.employeeId)).size} employé(s)
                  </span>
                )}
              </>
            ) : (
              <>
                <span>
                  {dayShiftCount} shift(s) –{" "}
                  <span className="capitalize">{dayLabel}</span>
                </span>
              </>
            )}
          </div>

          {/* Employee list for quick access (admin, week view) */}
          {isAdmin && storeId && shifts.length > 0 && viewMode === "week" && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Employés cette semaine
              </h3>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  new Map(
                    shifts.map((s) => [
                      s.employeeId,
                      s.employee,
                    ])
                  ).values()
                ).map((emp) => (
                  <Link
                    key={emp.id}
                    href={`/planning/employee/${emp.id}?weekStart=${weekStart}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm hover:bg-gray-50 transition-colors"
                  >
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    {emp.firstName} {emp.lastName}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Shift modal */}
      {isAdmin && (
        <ShiftModal
          open={shiftModalOpen}
          onClose={() => setShiftModalOpen(false)}
          onSaved={loadShifts}
          storeId={storeId}
          shift={
            editingShift
              ? {
                  id: editingShift.id,
                  storeId: editingShift.storeId,
                  employeeId: editingShift.employeeId,
                  date: editingShift.date.split("T")[0],
                  startTime: editingShift.startTime,
                  endTime: editingShift.endTime,
                  note: editingShift.note || "",
                }
              : null
          }
          defaultDate={defaultDate}
          defaultStartTime={defaultStartTime}
          employees={employees}
        />
      )}

      {/* Floating add button for mobile (admin only) */}
      {isAdmin && storeId && (
        <button
          onClick={() => {
            setEditingShift(null);
            setDefaultDate(viewMode === "day" ? selectedDateStr : formatDate(new Date()));
            setDefaultStartTime("09:00");
            setShiftModalOpen(true);
          }}
          className="fixed bottom-6 right-6 lg:hidden h-14 w-14 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center hover:bg-gray-800 transition-colors z-50"
          title="Ajouter un shift"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
