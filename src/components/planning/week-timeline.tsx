"use client";

import { useMemo } from "react";
import { getDayNameFr, formatDate, getWeekDays } from "@/lib/utils";
import {
  assignLanes,
  calculateCoverage,
  getEmployeeColor,
  detectShiftViolations,
  timeToMinutes,
  type TimelineShift,
  type PositionedShift,
  type StoreScheduleInfo,
} from "@/lib/timeline-utils";
import { ShiftDragGhost } from "./shift-drag-ghost";
import type { DragState } from "@/hooks/useShiftDrag";
import { Plus } from "lucide-react";

interface WeekTimelineProps {
  weekStart: string;
  shifts: TimelineShift[];
  onShiftClick: (shift: TimelineShift) => void;
  onAddShift: (date: string, time?: string) => void;
  mode: "store" | "employee";
  gridStartHour: number;
  gridEndHour: number;
  storeSchedules?: StoreScheduleInfo[];
  multiStore?: boolean;
  // Drag-and-drop props
  dragState?: DragState | null;
  onShiftPointerDown?: (
    e: React.PointerEvent,
    shiftId: string,
    startMin: number,
    endMin: number,
    date: string,
    lane: number,
    totalLanes: number,
    employeeId: string | null
  ) => void;
  didDrag?: boolean;
  clearDidDrag?: () => void;
  gridRef?: React.RefObject<HTMLDivElement | null>;
}

export function WeekTimeline({
  weekStart,
  shifts,
  onShiftClick,
  onAddShift,
  mode,
  gridStartHour,
  gridEndHour,
  storeSchedules,
  multiStore,
  dragState,
  onShiftPointerDown,
  didDrag,
  clearDidDrag,
  gridRef,
}: WeekTimelineProps) {
  const days = getWeekDays(weekStart);
  const totalHours = gridEndHour - gridStartHour;
  const HOUR_HEIGHT = 60; // pixels per hour
  const gridHeight = totalHours * HOUR_HEIGHT;

  // Group shifts by date
  const shiftsByDate = useMemo(() => {
    const map: Record<string, TimelineShift[]> = {};
    for (const day of days) {
      map[formatDate(day)] = [];
    }
    for (const shift of shifts) {
      const key = typeof shift.date === "string"
        ? shift.date.split("T")[0]
        : formatDate(new Date(shift.date));
      if (map[key]) {
        map[key].push(shift);
      }
    }
    return map;
  }, [shifts, days]);

  // Compute lanes per day
  const lanesByDate = useMemo(() => {
    const map: Record<string, PositionedShift[]> = {};
    for (const [dateStr, dayShifts] of Object.entries(shiftsByDate)) {
      map[dateStr] = assignLanes(dayShifts);
    }
    return map;
  }, [shiftsByDate]);

  // Coverage per day
  const coverageByDate = useMemo(() => {
    const map: Record<string, { hour: number; count: number }[]> = {};
    for (const [dateStr, dayShifts] of Object.entries(shiftsByDate)) {
      map[dateStr] = calculateCoverage(dayShifts, gridStartHour, gridEndHour);
    }
    return map;
  }, [shiftsByDate, gridStartHour, gridEndHour]);

  const isToday = (date: Date) => {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  };

  // Current time indicator position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowInRange = nowMinutes >= gridStartHour * 60 && nowMinutes <= gridEndHour * 60;
  const nowOffset = nowInRange ? ((nowMinutes - gridStartHour * 60) / (totalHours * 60)) * gridHeight : -1;

  function handleCellClick(dateStr: string, e: React.MouseEvent<HTMLDivElement>) {
    if (didDrag) {
      clearDidDrag?.();
      return;
    }
    // Calculate clicked hour from mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesFromStart = (y / gridHeight) * totalHours * 60;
    const hour = Math.floor((gridStartHour * 60 + minutesFromStart) / 60);
    const minutes = Math.round(((gridStartHour * 60 + minutesFromStart) % 60) / 15) * 15;
    const time = `${hour.toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
    onAddShift(dateStr, time);
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header row: days */}
      <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-20">
        {/* Time column header */}
        <div className="w-14 shrink-0 border-r border-gray-200" />
        {/* Day columns */}
        {days.map((day, idx) => {
          const dateStr = formatDate(day);
          const dayShifts = shiftsByDate[dateStr] || [];
          const today = isToday(day);
          return (
            <div
              key={dateStr}
              className={`flex-1 min-w-[48px] sm:min-w-[80px] md:min-w-[100px] lg:min-w-[120px] px-1 sm:px-2 py-1.5 sm:py-2 text-center border-r border-gray-200 last:border-r-0 ${
                today ? "bg-blue-50" : ""
              }`}
            >
              <div className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase">
                {getDayNameFr(idx).slice(0, 3)}
              </div>
              <div
                className={`text-sm sm:text-lg font-bold ${
                  today ? "text-blue-600" : "text-gray-900"
                }`}
              >
                {day.getUTCDate()}
              </div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 hidden sm:block">
                {dayShifts.length} shift{dayShifts.length !== 1 ? "s" : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid body */}
      <div ref={gridRef} className="flex overflow-x-auto">
        {/* Time labels */}
        <div className="w-14 shrink-0 border-r border-gray-200 relative" style={{ height: gridHeight }}>
          {Array.from({ length: totalHours }, (_, i) => (
            <div
              key={i}
              className="absolute w-full text-right pr-2 text-[11px] text-gray-400 -translate-y-1/2 select-none"
              style={{ top: i * HOUR_HEIGHT }}
            >
              {(gridStartHour + i).toString().padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, idx) => {
          const dateStr = formatDate(day);
          const positioned = lanesByDate[dateStr] || [];
          const coverage = coverageByDate[dateStr] || [];
          const today = isToday(day);

          return (
            <div
              key={dateStr}
              className={`flex-1 min-w-[48px] sm:min-w-[80px] md:min-w-[100px] lg:min-w-[120px] border-r border-gray-200 last:border-r-0 relative ${
                today ? "bg-blue-50/30" : ""
              }`}
              style={{ height: gridHeight, touchAction: "pan-x" }}
              onClick={(e) => {
                // Only trigger if clicking on the background, not a shift
                if ((e.target as HTMLElement).dataset.bgCell === "true") {
                  handleCellClick(dateStr, e);
                }
              }}
            >
              {/* Hour grid lines */}
              {Array.from({ length: totalHours }, (_, i) => (
                <div
                  key={i}
                  className="absolute w-full border-t border-gray-100"
                  style={{ top: i * HOUR_HEIGHT }}
                  data-bg-cell="true"
                />
              ))}

              {/* Half-hour dashed lines */}
              {Array.from({ length: totalHours }, (_, i) => (
                <div
                  key={`half-${i}`}
                  className="absolute w-full border-t border-dashed border-gray-50"
                  style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  data-bg-cell="true"
                />
              ))}

              {/* Store hours overlay (grey zones for closed hours) */}
              {(() => {
                const dayOfWeek = day.getUTCDay();
                const sched = storeSchedules?.find(s => s.dayOfWeek === dayOfWeek);
                if (!sched || sched.closed) return null;
                const gridStartMin = gridStartHour * 60;
                const gridEndMin = gridEndHour * 60;
                const openMin = timeToMinutes(sched.openTime);
                const closeMin = timeToMinutes(sched.closeTime);
                const closedStyle = {
                  background: 'repeating-linear-gradient(-45deg, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 2px, transparent 2px, transparent 6px)',
                  backgroundColor: 'rgba(0,0,0,0.04)',
                };
                return (
                  <>
                    {openMin > gridStartMin && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none z-[5]"
                        style={{ ...closedStyle, top: 0, height: ((openMin - gridStartMin) / (totalHours * 60)) * gridHeight }}
                      />
                    )}
                    {closeMin < gridEndMin && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none z-[5]"
                        style={{ ...closedStyle, top: ((closeMin - gridStartMin) / (totalHours * 60)) * gridHeight, height: ((gridEndMin - closeMin) / (totalHours * 60)) * gridHeight }}
                      />
                    )}
                    {/* Opening line (green dashed) */}
                    {openMin >= gridStartMin && openMin <= gridEndMin && (
                      <div
                        className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-green-400 pointer-events-none z-[6]"
                        style={{ top: ((openMin - gridStartMin) / (totalHours * 60)) * gridHeight }}
                      />
                    )}
                    {/* Closing line (red dashed) */}
                    {closeMin >= gridStartMin && closeMin <= gridEndMin && (
                      <div
                        className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-red-400 pointer-events-none z-[6]"
                        style={{ top: ((closeMin - gridStartMin) / (totalHours * 60)) * gridHeight }}
                      />
                    )}
                  </>
                );
              })()}

              {/* Coverage indicator (left edge) */}
              {mode === "store" && (
                <div className="absolute left-0 top-0 w-1 z-10" style={{ height: gridHeight }}>
                  {coverage.map((slot) => {
                    const top = (slot.hour - gridStartHour) * HOUR_HEIGHT;
                    // Check if this hour is within store opening hours
                    const dayOfWeek = day.getUTCDay();
                    const sched = storeSchedules?.find(s => s.dayOfWeek === dayOfWeek);
                    const isOpen = sched && !sched.closed;
                    const slotMin = slot.hour * 60;
                    const openMin = isOpen ? timeToMinutes(sched!.openTime) : 0;
                    const closeMin = isOpen ? timeToMinutes(sched!.closeTime) : 1440;
                    const isDuringOpen = !sched || (isOpen && slotMin >= openMin && slotMin < closeMin);

                    let color = "bg-gray-100";
                    if (!isDuringOpen) {
                      color = "bg-gray-100"; // Outside hours: neutral
                    } else if (slot.count === 0) color = "bg-red-400";
                    else if (slot.count === 1) color = "bg-yellow-400";
                    else if (slot.count >= 2) color = "bg-green-400";
                    return (
                      <div
                        key={slot.hour}
                        className={`absolute w-full ${color}`}
                        style={{ top, height: HOUR_HEIGHT }}
                        title={`${slot.hour}h: ${slot.count} employé(s)${!isDuringOpen ? ' (fermé)' : ''}`}
                      />
                    );
                  })}
                </div>
              )}

              {/* Clickable background */}
              <div
                className="absolute inset-0 cursor-pointer z-0"
                data-bg-cell="true"
                onClick={(e) => handleCellClick(dateStr, e)}
              />

              {/* Shift blocks */}
              {positioned.map((shift) => {
                const top =
                  ((shift.startMinutes - gridStartHour * 60) / (totalHours * 60)) *
                  gridHeight;
                const height =
                  ((shift.endMinutes - shift.startMinutes) / (totalHours * 60)) *
                  gridHeight;
                const laneWidth = 100 / shift.totalLanes;
                const left = shift.lane * laneWidth;
                const colors = getEmployeeColor(shift.employeeId);
                const paddingLeft = mode === "store" ? 4 : 0; // space for coverage bar
                const isBeingDragged = dragState?.shiftId === shift.id && dragState.isDragging;

                return (
                  <button
                    key={shift.id}
                    className={`absolute rounded-sm border ${colors.bg} ${colors.border} ${colors.text} ${colors.hoverBg} transition-colors overflow-hidden z-10 text-left ${
                      onShiftPointerDown ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                    }`}
                    style={{
                      top: Math.max(top, 0),
                      height: Math.max(height, 18),
                      left: `calc(${left}% + ${paddingLeft}px)`,
                      width: `calc(${laneWidth}% - ${paddingLeft + 2}px)`,
                      opacity: isBeingDragged ? 0.3 : 1,
                      touchAction: onShiftPointerDown ? "none" : undefined,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (didDrag) {
                        clearDidDrag?.();
                        return;
                      }
                      onShiftClick(shift);
                    }}
                    onPointerDown={
                      onShiftPointerDown
                        ? (e) => {
                            onShiftPointerDown(
                              e,
                              shift.id,
                              shift.startMinutes,
                              shift.endMinutes,
                              dateStr,
                              shift.lane,
                              shift.totalLanes,
                              shift.employeeId
                            );
                          }
                        : undefined
                    }
                    title={`${shift.employee ? `${shift.employee.firstName} ${shift.employee.lastName}` : "NON ASSIGNÉ"}\n${shift.startTime} - ${shift.endTime}${shift.note ? `\n${shift.note}` : ""}`}
                  >
                    {/* Resize handle: top */}
                    {onShiftPointerDown && (
                      <div className="absolute top-0 left-0 right-0 h-3 cursor-ns-resize z-20 flex items-start justify-center">
                        <div className="w-6 h-0.5 bg-current opacity-20 rounded-full mt-0.5" />
                      </div>
                    )}
                    <div className="px-0.5 sm:px-1 py-0.5 leading-tight">
                      <div className="text-[9px] sm:text-[11px] font-bold truncate">
                        {mode === "store"
                          ? shift.employee
                            ? `${shift.employee.firstName} ${shift.employee.lastName.charAt(0)}.`
                            : "NON ASSIGNÉ"
                          : shift.store.name}
                      </div>
                      <div className="text-[8px] sm:text-[10px] opacity-80 truncate">
                        {shift.startTime}-{shift.endTime}
                      </div>
                      {(() => {
                        const dayOfWeek = day.getUTCDay();
                        const sched = storeSchedules?.find(s => s.dayOfWeek === dayOfWeek) || null;
                        const dayShiftsArr = shiftsByDate[dateStr] || [];
                        const violations = detectShiftViolations(shift, dayShiftsArr, sched);
                        if (violations.length === 0 || height <= 30) return null;
                        return (
                          <div className="text-[7px] sm:text-[8px] font-bold text-red-600 bg-red-100 rounded px-0.5 truncate">
                            {violations[0].message}
                          </div>
                        );
                      })()}
                      {multiStore && height > 35 && (
                        <div className="text-[7px] sm:text-[9px] opacity-60 truncate">
                          {shift.store.name}
                        </div>
                      )}
                      {(() => {
                        const shiftHours = (shift.endMinutes - shift.startMinutes) / 60;
                        return shiftHours > 6 && height > 45 ? (
                          <div className="text-[7px] sm:text-[8px] opacity-50 truncate">
                            pause 30min
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {/* Resize handle: bottom */}
                    {onShiftPointerDown && (
                      <div className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-20 flex items-end justify-center">
                        <div className="w-6 h-0.5 bg-current opacity-20 rounded-full mb-0.5" />
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Drag ghost */}
              {dragState?.isDragging && dragState.previewDate === dateStr && (
                <ShiftDragGhost
                  startMinutes={dragState.previewStartMinutes}
                  endMinutes={dragState.previewEndMinutes}
                  gridStartHour={gridStartHour}
                  gridEndHour={gridEndHour}
                  gridHeight={gridHeight}
                  lane={dragState.lane}
                  totalLanes={dragState.totalLanes}
                  paddingLeft={mode === "store" ? 4 : 0}
                />
              )}

              {/* Current time indicator */}
              {today && nowInRange && (
                <div
                  className="absolute left-0 right-0 z-30 pointer-events-none"
                  style={{ top: nowOffset }}
                >
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                    <div className="flex-1 h-[2px] bg-red-500" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coverage legend */}
      {mode === "store" && (
        <div className="border-t border-gray-200 px-2 sm:px-4 py-2 flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-[11px] text-gray-500 bg-gray-50">
          <span className="font-medium">Couverture :</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" /> 0 pers.
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400" /> 1 pers.
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400" /> 2+ pers.
          </span>
        </div>
      )}
    </div>
  );
}
