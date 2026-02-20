"use client";

import { getDayNameFr, formatDate, getWeekDays } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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

interface WeekGridProps {
  weekStart: string;
  shifts: Shift[];
  onShiftClick: (shift: Shift) => void;
  onAddShift: (date: string) => void;
  mode: "store" | "employee";
}

export function WeekGrid({
  weekStart,
  shifts,
  onShiftClick,
  onAddShift,
  mode,
}: WeekGridProps) {
  const days = getWeekDays(weekStart);

  // Group shifts by date
  const shiftsByDate: Record<string, Shift[]> = {};
  for (const day of days) {
    const key = formatDate(day);
    shiftsByDate[key] = [];
  }
  for (const shift of shifts) {
    const key =
      typeof shift.date === "string"
        ? shift.date.split("T")[0]
        : formatDate(new Date(shift.date));
    if (shiftsByDate[key]) {
      shiftsByDate[key].push(shift);
    }
  }

  // Sort shifts within each day by start time
  for (const key of Object.keys(shiftsByDate)) {
    shiftsByDate[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const isToday = (date: Date) => {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  };

  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
      {days.map((day, idx) => {
        const dateStr = formatDate(day);
        const dayShifts = shiftsByDate[dateStr] || [];
        const today = isToday(day);

        return (
          <div
            key={dateStr}
            className={`bg-white min-h-[160px] flex flex-col ${
              today ? "ring-2 ring-inset ring-blue-400" : ""
            }`}
          >
            {/* Day header */}
            <div
              className={`px-2 py-1.5 border-b border-gray-100 flex items-center justify-between ${
                today ? "bg-blue-50" : "bg-gray-50"
              }`}
            >
              <div>
                <span className="text-xs font-medium text-gray-500">
                  {getDayNameFr(idx)}
                </span>
                <span
                  className={`ml-1.5 text-sm font-semibold ${
                    today ? "text-blue-600" : "text-gray-900"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onAddShift(dateStr)}
                title="Ajouter un shift"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Shifts */}
            <div className="flex-1 p-1 space-y-1">
              {dayShifts.map((shift) => (
                <button
                  key={shift.id}
                  onClick={() => onShiftClick(shift)}
                  className="w-full text-left p-1.5 rounded text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors group"
                >
                  <div className="font-semibold text-blue-900">
                    {shift.startTime} - {shift.endTime}
                  </div>
                  <div className="text-blue-700 truncate">
                    {mode === "store"
                      ? `${shift.employee.firstName} ${shift.employee.lastName}`
                      : shift.store.name}
                  </div>
                  {shift.note && (
                    <div className="text-blue-500 truncate mt-0.5 italic">
                      {shift.note}
                    </div>
                  )}
                </button>
              ))}
              {dayShifts.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-300">
                  -
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
