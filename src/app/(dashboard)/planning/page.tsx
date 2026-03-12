"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { StoreSearch } from "@/components/store-search";
import { WeekTimeline } from "@/components/planning/week-timeline";
import { DayTimeline } from "@/components/planning/day-timeline";
import { ShiftModal } from "@/components/planning/shift-modal";
import { useShiftDrag } from "@/hooks/useShiftDrag";
import { AutoPlanModal } from "@/components/planning/auto-plan-modal";
import { ManagerIABar } from "@/components/planning/manager-ia-bar";
import { PlanningHealth } from "@/components/planning/planning-health";
import { ShiftExchangePanel } from "@/components/planning/shift-exchange-panel";
import { getMondayOfWeek, formatDate, getDayNameFr, getWeekDays } from "@/lib/utils";
import type { StoreScheduleInfo } from "@/lib/timeline-utils";
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
  Zap,
  ZoomIn,
  Store,
  Eye,
  Trash2,
} from "lucide-react";
import Link from "next/link";

interface Shift {
  id: string;
  storeId: string;
  employeeId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
  store: { id: string; name: string; schedules?: StoreScheduleInfo[] };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    weeklyHours?: number | null;
  } | null;
}

interface StoreWithSchedules {
  id: string;
  name: string;
  schedules: StoreScheduleInfo[];
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
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN" || role === "MANAGER";
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
  const [autoPlanOpen, setAutoPlanOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [shiftsVersion, setShiftsVersion] = useState(0);

  // Multi-store state
  const [allStores, setAllStores] = useState<StoreWithSchedules[]>([]);
  const [shiftModalStoreId, setShiftModalStoreId] = useState("");

  // View mode: week or day
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // Zoom: grid hours — "auto" mode fits to store schedules
  const [manualGrid, setManualGrid] = useState<{ start: number; end: number } | null>(null);
  const [showZoomMenu, setShowZoomMenu] = useState(false);

  const isMultiStore = isAdmin && !storeId;

  // Compute auto grid bounds from visible stores' schedules
  const autoGrid = useMemo(() => {
    const stores = isMultiStore ? allStores : (storeId ? allStores.filter(s => s.id === storeId) : []);
    if (stores.length === 0) return { start: 6, end: 22 };
    let earliest = 24, latest = 0;
    for (const store of stores) {
      for (const sched of store.schedules) {
        if (sched.closed) continue;
        const open = parseInt(sched.openTime?.split(":")[0] || "6", 10);
        const closeH = parseInt(sched.closeTime?.split(":")[0] || "22", 10);
        const closeM = parseInt(sched.closeTime?.split(":")[1] || "0", 10);
        const close = closeM > 0 ? closeH + 1 : closeH; // round up
        if (open < earliest) earliest = open;
        if (close > latest) latest = close;
      }
    }
    if (earliest >= latest) return { start: 6, end: 22 };
    // Add 1h margin before, keep end as-is (already rounded up)
    return { start: Math.max(0, earliest - 1), end: Math.min(24, latest) };
  }, [isMultiStore, storeId, allStores]);

  const gridStartHour = manualGrid ? manualGrid.start : autoGrid.start;
  const gridEndHour = manualGrid ? manualGrid.end : autoGrid.end;

  // Drag-and-drop (refs + state declared here, hook after loadShifts)
  const gridRef = useRef<HTMLDivElement>(null);
  const dayDates = useMemo(
    () => getWeekDays(weekStart).map((d) => formatDate(d)),
    [weekStart]
  );
  const [dragError, setDragError] = useState("");

  // Load all stores (for multi-store view)
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/stores?limit=50")
      .then((r) => r.json())
      .then((data) => setAllStores(data.stores || []))
      .catch(() => {});
    fetch("/api/alerts/generate", { method: "POST" }).catch(() => {});
  }, [isAdmin]);

  const loadShifts = useCallback(async () => {
    if (!isAdmin && !employeeId) return;

    try {
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
        setShiftsVersion((v) => v + 1);
      }
    } catch {
      console.error("Erreur chargement shifts");
    }
  }, [weekStart, storeId, isAdmin, employeeId]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Drag-and-drop hook (after loadShifts)
  const handleDragEnd = useCallback(
    async (
      shiftId: string,
      newDate: string,
      newStartTime: string,
      newEndTime: string
    ) => {
      const shift = shifts.find((s) => s.id === shiftId);
      if (!shift) return;

      const oldDate =
        typeof shift.date === "string" ? shift.date.split("T")[0] : formatDate(new Date(shift.date));

      if (
        oldDate === newDate &&
        shift.startTime === newStartTime &&
        shift.endTime === newEndTime
      ) {
        return;
      }

      const previousShifts = [...shifts];

      // Optimistic update
      setShifts((prev) =>
        prev.map((s) =>
          s.id === shiftId
            ? { ...s, date: newDate, startTime: newStartTime, endTime: newEndTime }
            : s
        )
      );

      try {
        const res = await fetch(`/api/shifts/${shiftId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId: shift.storeId,
            employeeId: shift.employeeId || "",
            date: newDate,
            startTime: newStartTime,
            endTime: newEndTime,
            note: shift.note || "",
          }),
        });

        if (!res.ok) {
          setShifts(previousShifts);
          const data = await res.json();
          setDragError(data.error || "Erreur lors du déplacement");
          setTimeout(() => setDragError(""), 4000);
        } else {
          loadShifts();
        }
      } catch {
        setShifts(previousShifts);
        setDragError("Erreur réseau");
        setTimeout(() => setDragError(""), 4000);
      }
    },
    [shifts, loadShifts]
  );

  const { dragState, handleShiftPointerDown, didDrag, clearDidDrag } =
    useShiftDrag({
      hourHeight: viewMode === "week" ? 60 : 64,
      gridStartHour,
      gridEndHour,
      viewMode,
      dayDates,
      gridRef,
      onDragEnd: handleDragEnd,
      enabled: isAdmin,
    });

  // Load employees for shift creation (use modal store or selected store)
  const activeStoreForEmployees = storeId || shiftModalStoreId;
  useEffect(() => {
    if (!isAdmin || !activeStoreForEmployees) {
      setEmployees([]);
      return;
    }
    fetch(`/api/employees?storeId=${activeStoreForEmployees}&active=true&limit=100`)
      .then((r) => r.json())
      .then((data) => setEmployees(data.employees || []))
      .catch(() => {});
  }, [activeStoreForEmployees, isAdmin]);

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
    if (didDrag) {
      clearDidDrag();
      return;
    }
    setEditingShift(shift);
    setShiftModalStoreId(shift.storeId);
    setDefaultDate("");
    setDefaultStartTime("09:00");
    setShiftModalOpen(true);
  }

  function handleAddShift(date: string, time?: string, forStoreId?: string) {
    if (!isAdmin) return;
    setEditingShift(null);
    if (forStoreId) setShiftModalStoreId(forStoreId);
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

    try {
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

      if (!res.ok) {
        setDuplicateMsg(data.error || "Erreur");
      } else {
        setDuplicateMsg(data.message || `${data.created} shift(s) créé(s), ${data.skipped} ignoré(s) (conflits)`);
        loadShifts();
      }
    } catch {
      setDuplicateMsg("Erreur réseau");
    } finally {
      setDuplicating(false);
      setTimeout(() => setDuplicateMsg(""), 5000);
    }
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

  async function handleCancelWeek() {
    const target = storeId ? "ce magasin" : "TOUS les magasins";
    const shiftCount = shifts.length;
    if (shiftCount === 0) {
      alert("Aucun shift à supprimer cette semaine");
      return;
    }
    if (
      !confirm(
        `Supprimer les ${shiftCount} shift(s) de la semaine pour ${target} ?\n\nCette action est irréversible.`
      )
    )
      return;

    setCancelling(true);
    setDuplicateMsg("");

    try {
      const res = await fetch("/api/shifts/cancel-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          storeId: storeId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setDuplicateMsg(`Erreur: ${data.error}`);
      } else {
        setDuplicateMsg(`${data.deleted} shift(s) supprimé(s)`);
        loadShifts();
      }
    } catch {
      setDuplicateMsg("Erreur réseau");
    } finally {
      setCancelling(false);
      setTimeout(() => setDuplicateMsg(""), 5000);
    }
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

  // Get store schedules for single-store mode (from first shift or allStores)
  const singleStoreSchedules = storeId
    ? (allStores.find((s) => s.id === storeId)?.schedules ||
       shifts[0]?.store?.schedules ||
       undefined)
    : undefined;

  // Effective storeId for the shift modal
  const modalStoreId = shiftModalStoreId || storeId;

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "Planning" : "Mon Planning"}
        </h1>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => setAutoPlanOpen(true)}
            >
              <Zap className="h-4 w-4 mr-1.5" />
              {storeId ? "Auto-planifier" : "Auto-planifier (tous)"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating || !storeId}>
              <Copy className="h-4 w-4 mr-1.5" />
              {duplicating ? "Duplication..." : "Dupliquer semaine"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!storeId}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              onClick={handleCancelWeek}
              disabled={cancelling || shifts.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {cancelling ? "Suppression..." : "Annuler semaine"}
            </Button>
          </div>
        )}
      </div>

      {/* Filters + controls */}
      <div className="space-y-3 mb-4">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <div className="w-full lg:w-72">
              <StoreSearch
                value={storeId}
                onChange={setStoreId}
                placeholder="Filtrer par magasin..."
              />
            </div>
            {storeId && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setStoreId("")}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Voir tous
              </Button>
            )}
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
                  {/* Auto preset — fits to store hours */}
                  <button
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                      !manualGrid
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700"
                    }`}
                    onClick={() => {
                      setManualGrid(null);
                      setShowZoomMenu(false);
                    }}
                  >
                    Auto (horaires magasin)
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  {ZOOM_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        manualGrid && gridStartHour === preset.start && gridEndHour === preset.end
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-gray-700"
                      }`}
                      onClick={() => {
                        setManualGrid({ start: preset.start, end: preset.end });
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

      {dragError && (
        <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md p-3">
          {dragError}
        </div>
      )}

      {/* Planning Health Widget */}
      {isAdmin && shifts.length > 0 && (
        <PlanningHealth
          weekStart={weekStart}
          storeId={storeId || undefined}
          shiftsVersion={shiftsVersion}
        />
      )}

      {/* Shift Exchanges */}
      {isAdmin && (
        <ShiftExchangePanel
          employeeId={employeeId || ""}
          role={role as "ADMIN" | "MANAGER"}
        />
      )}

      {/* Main content */}
      {isMultiStore ? (
        /* ═══ Multi-store view: all stores stacked ═══ */
        allStores.length > 0 ? (
          <div className="space-y-6">
            {allStores.map((store) => {
              const storeShifts = shifts.filter((s) => s.storeId === store.id);
              return (
                <div key={store.id}>
                  {/* Store header */}
                  <div className="flex items-center gap-2 mb-2">
                    <Store className="h-4 w-4 text-gray-400" />
                    <h3 className="text-sm font-bold text-gray-800">{store.name}</h3>
                    <span className="text-xs text-gray-400">
                      {storeShifts.length} shift{storeShifts.length !== 1 ? "s" : ""}
                    </span>
                    <button
                      className="ml-auto text-xs text-blue-600 hover:underline"
                      onClick={() => setStoreId(store.id)}
                    >
                      Voir seul
                    </button>
                  </div>

                  {/* Timeline */}
                  <div className="overflow-x-auto">
                    {viewMode === "week" ? (
                      <WeekTimeline
                        weekStart={weekStart}
                        shifts={storeShifts}
                        onShiftClick={handleShiftClick}
                        onAddShift={(date, time) => handleAddShift(date, time, store.id)}
                        mode="store"
                        gridStartHour={gridStartHour}
                        gridEndHour={gridEndHour}
                        storeSchedules={store.schedules}
                        dragState={dragState}
                        onShiftPointerDown={handleShiftPointerDown}
                        didDrag={didDrag}
                        clearDidDrag={clearDidDrag}
                      />
                    ) : (
                      <DayTimeline
                        date={selectedDateStr}
                        shifts={storeShifts}
                        onShiftClick={handleShiftClick}
                        onAddShift={(date, time) => handleAddShift(date, time, store.id)}
                        mode="store"
                        gridStartHour={gridStartHour}
                        gridEndHour={gridEndHour}
                        storeSchedules={store.schedules}
                        dragState={dragState}
                        onShiftPointerDown={handleShiftPointerDown}
                        didDrag={didDrag}
                        clearDidDrag={clearDidDrag}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Quick stats (multi-store) */}
            <div className="flex gap-4 text-sm text-gray-500">
              <span>{shifts.length} shift(s) cette semaine</span>
              <span>
                {new Set(shifts.filter(s => s.employeeId).map((s) => s.employeeId)).size} employé(s)
              </span>
              <span>{allStores.length} magasin(s)</span>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Chargement des magasins...</p>
          </div>
        )
      ) : !isAdmin && !employeeId ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Aucun profil employé lié à ce compte</p>
        </div>
      ) : (
        /* ═══ Single-store view (or employee view) ═══ */
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
                storeSchedules={singleStoreSchedules}
                dragState={isAdmin ? dragState : undefined}
                onShiftPointerDown={isAdmin ? handleShiftPointerDown : undefined}
                didDrag={didDrag}
                clearDidDrag={clearDidDrag}
                gridRef={gridRef}
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
                storeSchedules={singleStoreSchedules}
                dragState={isAdmin ? dragState : undefined}
                onShiftPointerDown={isAdmin ? handleShiftPointerDown : undefined}
                didDrag={didDrag}
                clearDidDrag={clearDidDrag}
                gridRef={gridRef}
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
                    {new Set(shifts.filter(s => s.employeeId).map((s) => s.employeeId)).size} employé(s)
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
                    shifts
                      .filter((s) => s.employee && s.employeeId)
                      .map((s) => [
                        s.employeeId,
                        s.employee!,
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
          onClose={() => {
            setShiftModalOpen(false);
            setShiftModalStoreId("");
          }}
          onSaved={loadShifts}
          storeId={modalStoreId}
          shift={
            editingShift
              ? {
                  id: editingShift.id,
                  storeId: editingShift.storeId,
                  employeeId: editingShift.employeeId || "",
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
          stores={allStores.length > 1 ? allStores.map(s => ({ id: s.id, name: s.name })) : undefined}
          storeSchedules={allStores.find(s => s.id === modalStoreId)?.schedules}
        />
      )}

      {/* Auto-plan modal */}
      {isAdmin && (
        <AutoPlanModal
          open={autoPlanOpen}
          onClose={() => setAutoPlanOpen(false)}
          onSaved={() => {
            loadShifts();
          }}
          storeId={storeId || undefined}
          weekStart={weekStart}
        />
      )}

      {/* Manager IA command bar */}
      {isAdmin && (
        <ManagerIABar
          weekStart={weekStart}
          storeId={storeId}
          onApplied={() => loadShifts()}
        />
      )}

      {/* Floating add button for mobile (admin only, single store) */}
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
