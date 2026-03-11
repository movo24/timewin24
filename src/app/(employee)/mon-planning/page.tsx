"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShiftExchangePanel } from "@/components/planning/shift-exchange-panel";
import { ShiftExchangeModal } from "@/components/planning/shift-exchange-modal";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarDays,
  Clock,
  MapPin,
  Timer,
  User,
  Upload,
} from "lucide-react";

interface Shift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
  store: { id: string; name: string; city: string | null };
}

interface ShiftResponse {
  shifts: Shift[];
  totalHours: number;
  shiftCount: number;
}

type ViewMode = "week" | "month";

const DAY_NAMES_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_NAMES_FULL = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function getMondayOfWeek(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getWeekDays(weekStart: string): Date[] {
  const days: Date[] = [];
  const start = new Date(weekStart + "T00:00:00Z");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

function shiftDuration(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

export default function MonPlanningPage() {
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState(getMondayOfWeek());
  const [monthKey, setMonthKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<ShiftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchangeShift, setExchangeShift] = useState<Shift | null>(null);
  const [publishingShift, setPublishingShift] = useState<string | null>(null);

  async function handlePublish(shift: Shift) {
    if (publishingShift) return;
    setPublishingShift(shift.id);
    try {
      const res = await fetch("/api/market-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: shift.id }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Shift publié sur le marché !");
      } else {
        alert(data.error || "Erreur lors de la publication");
      }
    } catch {
      alert("Erreur réseau");
    }
    setPublishingShift(null);
  }

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const params =
        viewMode === "week"
          ? `weekStart=${weekStart}`
          : `month=${monthKey}`;
      const res = await fetch(`/api/me/shifts?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [viewMode, weekStart, monthKey]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  function navigateWeek(direction: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7 * direction);
    setWeekStart(formatDate(d));
  }

  function navigateMonth(direction: number) {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    setMonthKey(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  function goToToday() {
    setWeekStart(getMondayOfWeek());
    const now = new Date();
    setMonthKey(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    );
  }

  // Group shifts by date
  const shiftsByDate: Record<string, Shift[]> = {};
  if (data?.shifts) {
    for (const shift of data.shifts) {
      const key =
        typeof shift.date === "string"
          ? shift.date.split("T")[0]
          : formatDate(new Date(shift.date));
      if (!shiftsByDate[key]) shiftsByDate[key] = [];
      shiftsByDate[key].push(shift);
    }
  }

  // Week view dates
  const weekDays = getWeekDays(weekStart);
  const today = formatDate(new Date());

  // Format labels
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${new Date(weekStart).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })} – ${weekEnd.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const [mY, mM] = monthKey.split("-").map(Number);
  const monthLabel = new Date(mY, mM - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mon Planning</h1>
          {session?.user?.name && (
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {session.user.name}
            </p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
          <button
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === "week"
                ? "bg-white shadow-sm text-gray-900 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setViewMode("week")}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Semaine
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
              viewMode === "month"
                ? "bg-white shadow-sm text-gray-900 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setViewMode("month")}
          >
            <Calendar className="h-3.5 w-3.5" />
            Mois
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              viewMode === "week" ? navigateWeek(-1) : navigateMonth(-1)
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={goToToday}
          >
            Aujourd&apos;hui
          </Button>
          <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
            {viewMode === "week" ? weekLabel : monthLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() =>
              viewMode === "week" ? navigateWeek(1) : navigateMonth(1)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <p className="text-[10px] text-blue-500 uppercase font-medium">
              Shifts
            </p>
            <p className="text-lg font-bold text-blue-700">
              {data.shiftCount}
            </p>
          </div>
          <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <p className="text-[10px] text-emerald-500 uppercase font-medium">
              Heures
            </p>
            <p className="text-lg font-bold text-emerald-700">
              {data.totalHours}h
            </p>
          </div>
          <div className="flex-1 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
            <p className="text-[10px] text-purple-500 uppercase font-medium">
              Magasins
            </p>
            <p className="text-lg font-bold text-purple-700">
              {new Set(data.shifts.map((s) => s.store.id)).size}
            </p>
          </div>
        </div>
      )}

      {/* Shift exchanges */}
      {session?.user && (
        <div className="mb-4">
          <ShiftExchangePanel
            employeeId={(session.user as { employeeId?: string }).employeeId || ""}
            role="EMPLOYEE"
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      )}

      {/* Shifts list */}
      {!loading && data && (
        <div className="space-y-1">
          {viewMode === "week" ? (
            // Week view: show each day
            weekDays.map((day) => {
              const dateStr = formatDate(day);
              const dayShifts = shiftsByDate[dateStr] || [];
              const isToday = dateStr === today;
              const dayOfWeek = day.getUTCDay();

              return (
                <div
                  key={dateStr}
                  className={`rounded-lg border ${
                    isToday
                      ? "border-blue-200 bg-blue-50/30"
                      : "border-gray-100 bg-white"
                  }`}
                >
                  {/* Day header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold uppercase ${
                          isToday ? "text-blue-600" : "text-gray-400"
                        }`}
                      >
                        {DAY_NAMES_SHORT[dayOfWeek]}
                      </span>
                      <span
                        className={`text-sm font-medium ${
                          isToday ? "text-blue-700" : "text-gray-700"
                        }`}
                      >
                        {day.getUTCDate()}{" "}
                        {day.toLocaleDateString("fr-FR", {
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </span>
                      {isToday && (
                        <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">
                          Aujourd&apos;hui
                        </Badge>
                      )}
                    </div>
                    {dayShifts.length > 0 && (
                      <span className="text-xs text-gray-400">
                        {dayShifts
                          .reduce(
                            (sum, s) =>
                              sum + shiftDuration(s.startTime, s.endTime),
                            0
                          )
                          .toFixed(1)}
                        h
                      </span>
                    )}
                  </div>

                  {/* Shifts for this day */}
                  {dayShifts.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-300 text-center">
                      Repos
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {dayShifts.map((shift) => (
                        <ShiftCard key={shift.id} shift={shift} onExchange={setExchangeShift} onPublish={handlePublish} publishingId={publishingShift} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // Month view: show only dates with shifts
            <>
              {Object.keys(shiftsByDate).length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400">
                  Aucun shift ce mois-ci
                </div>
              ) : (
                Object.entries(shiftsByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([dateStr, dayShifts]) => {
                    const d = new Date(dateStr + "T00:00:00Z");
                    const isToday = dateStr === today;
                    const dayOfWeek = d.getUTCDay();

                    return (
                      <div
                        key={dateStr}
                        className={`rounded-lg border ${
                          isToday
                            ? "border-blue-200 bg-blue-50/30"
                            : "border-gray-100 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-bold uppercase ${
                                isToday ? "text-blue-600" : "text-gray-400"
                              }`}
                            >
                              {DAY_NAMES_FULL[dayOfWeek]}
                            </span>
                            <span className="text-sm font-medium text-gray-700">
                              {d.toLocaleDateString("fr-FR", {
                                day: "numeric",
                                month: "long",
                                timeZone: "UTC",
                              })}
                            </span>
                            {isToday && (
                              <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">
                                Aujourd&apos;hui
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {dayShifts
                              .reduce(
                                (sum, s) =>
                                  sum +
                                  shiftDuration(s.startTime, s.endTime),
                                0
                              )
                              .toFixed(1)}
                            h
                          </span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {dayShifts.map((shift) => (
                            <ShiftCard key={shift.id} shift={shift} onExchange={setExchangeShift} onPublish={handlePublish} publishingId={publishingShift} />
                          ))}
                        </div>
                      </div>
                    );
                  })
              )}
            </>
          )}
        </div>
      )}

      {/* Exchange modal */}
      {exchangeShift && (
        <ShiftExchangeModal
          open={!!exchangeShift}
          onClose={() => setExchangeShift(null)}
          shift={exchangeShift}
          onCreated={loadShifts}
        />
      )}
    </div>
  );
}

function ShiftCard({
  shift,
  onExchange,
  onPublish,
  publishingId,
}: {
  shift: Shift;
  onExchange: (s: Shift) => void;
  onPublish: (s: Shift) => void;
  publishingId: string | null;
}) {
  const hours = shiftDuration(shift.startTime, shift.endTime);
  const isFuture = shift.date.split("T")[0] >= new Date().toISOString().split("T")[0];

  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-3">
        {/* Time block */}
        <div className="flex flex-col items-center bg-gray-50 rounded px-2.5 py-1 min-w-[60px]">
          <span className="text-sm font-bold text-gray-800">
            {shift.startTime}
          </span>
          <span className="text-[10px] text-gray-400">–</span>
          <span className="text-sm font-bold text-gray-800">
            {shift.endTime}
          </span>
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-gray-400" />
            <span className="text-sm font-medium text-gray-800">
              {shift.store.name}
            </span>
            {shift.store.city && (
              <span className="text-xs text-gray-400">
                ({shift.store.city})
              </span>
            )}
          </div>
          {shift.note && (
            <p className="text-xs text-gray-400 mt-0.5">{shift.note}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isFuture && (
          <button
            onClick={() => onPublish(shift)}
            disabled={publishingId === shift.id}
            className="flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 px-1.5 py-1 rounded transition-colors disabled:opacity-50"
            title="Publier sur le marché"
          >
            <Upload className="h-3 w-3" />
            <span className="hidden sm:inline">Publier</span>
          </button>
        )}
        <button
          onClick={() => onExchange(shift)}
          className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 hover:bg-violet-50 px-1.5 py-1 rounded transition-colors"
          title="Proposer un échange"
        >
          <ArrowLeftRight className="h-3 w-3" />
          <span className="hidden sm:inline">Échanger</span>
        </button>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Timer className="h-3 w-3" />
          <span>{hours.toFixed(1)}h</span>
        </div>
      </div>
    </div>
  );
}
