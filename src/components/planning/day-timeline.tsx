"use client";

import { useMemo } from "react";
import { formatDate } from "@/lib/utils";
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

interface DayTimelineProps {
  date: string; // "YYYY-MM-DD"
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

export function DayTimeline({
  date,
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
}: DayTimelineProps) {
  const totalHours = gridEndHour - gridStartHour;
  const HOUR_HEIGHT = 64; // slightly taller for day view
  const gridHeight = totalHours * HOUR_HEIGHT;

  // Filter shifts for this date
  const dayShifts = useMemo(() => {
    return shifts.filter((s) => {
      const key = typeof s.date === "string"
        ? s.date.split("T")[0]
        : formatDate(new Date(s.date));
      return key === date;
    });
  }, [shifts, date]);

  const positioned = useMemo(() => assignLanes(dayShifts), [dayShifts]);
  const coverage = useMemo(
    () => calculateCoverage(dayShifts, gridStartHour, gridEndHour),
    [dayShifts, gridStartHour, gridEndHour]
  );

  // Current time indicator
  const now = new Date();
  const today = formatDate(now) === date;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowInRange = nowMinutes >= gridStartHour * 60 && nowMinutes <= gridEndHour * 60;
  const nowOffset = nowInRange
    ? ((nowMinutes - gridStartHour * 60) / (totalHours * 60)) * gridHeight
    : -1;

  // Store schedule for this specific day
  const scheduleForDay = useMemo(() => {
    if (!storeSchedules) return null;
    const [y, m, d] = date.split("-").map(Number);
    const dayDate = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dayDate.getUTCDay();
    return storeSchedules.find(s => s.dayOfWeek === dayOfWeek) || null;
  }, [storeSchedules, date]);

  // Employee summary for sidebar
  const employeeSummary = useMemo(() => {
    const map = new Map<string, { name: string; totalMinutes: number; shifts: number }>();
    for (const s of dayShifts) {
      const key = s.employeeId || "__unassigned__";
      const existing = map.get(key);
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      const duration = eh * 60 + em - (sh * 60 + sm);
      if (existing) {
        existing.totalMinutes += duration;
        existing.shifts++;
      } else {
        map.set(key, {
          name: s.employee
            ? `${s.employee.firstName} ${s.employee.lastName}`
            : "NON ASSIGNÉ",
          totalMinutes: duration,
          shifts: 1,
        });
      }
    }
    return Array.from(map.entries()).map(([id, data]) => ({ id, ...data }));
  }, [dayShifts]);

  function handleBgClick(e: React.MouseEvent<HTMLDivElement>) {
    if (didDrag) {
      clearDidDrag?.();
      return;
    }
    if ((e.target as HTMLElement).dataset.bgCell !== "true") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesFromStart = (y / gridHeight) * totalHours * 60;
    const hour = Math.floor((gridStartHour * 60 + minutesFromStart) / 60);
    const minutes = Math.round(((gridStartHour * 60 + minutesFromStart) % 60) / 15) * 15;
    const time = `${hour.toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
    onAddShift(date, time);
  }

  // Store hours overlay helpers
  const gridStartMin = gridStartHour * 60;
  const gridEndMin = gridEndHour * 60;
  const isOpen = scheduleForDay && !scheduleForDay.closed;
  const openMin = isOpen ? timeToMinutes(scheduleForDay!.openTime) : 0;
  const closeMin = isOpen ? timeToMinutes(scheduleForDay!.closeTime) : 1440;
  const closedStyle = {
    background: 'repeating-linear-gradient(-45deg, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 2px, transparent 2px, transparent 6px)',
    backgroundColor: 'rgba(0,0,0,0.04)',
  };

  return (
    <div className="flex gap-4">
      {/* Main timeline */}
      <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="flex">
          {/* Time labels */}
          <div className="w-16 shrink-0 border-r border-gray-200 relative bg-gray-50" style={{ height: gridHeight }}>
            {Array.from({ length: totalHours }, (_, i) => (
              <div
                key={i}
                className="absolute w-full text-right pr-2 text-xs text-gray-400 -translate-y-1/2 select-none font-mono"
                style={{ top: i * HOUR_HEIGHT }}
              >
                {(gridStartHour + i).toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {mode === "store" && (
            <div className="w-3 shrink-0 border-r border-gray-200 relative" style={{ height: gridHeight }}>
              {coverage.map((slot) => {
                const top = (slot.hour - gridStartHour) * HOUR_HEIGHT;
                const slotMin = slot.hour * 60;
                const isDuringOpen = !scheduleForDay || (isOpen && slotMin >= openMin && slotMin < closeMin);

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

          {/* Shift area */}
          <div
            ref={gridRef}
            className="flex-1 relative"
            style={{ height: gridHeight, touchAction: "pan-y" }}
            onClick={handleBgClick}
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
            {isOpen && (
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
            )}

            {/* Clickable background */}
            <div className="absolute inset-0 cursor-pointer" data-bg-cell="true" />

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
              const shiftHours = (shift.endMinutes - shift.startMinutes) / 60;
              const isBeingDragged = dragState?.shiftId === shift.id && dragState.isDragging;

              return (
                <button
                  key={shift.id}
                  className={`absolute rounded border ${colors.bg} ${colors.border} ${colors.text} ${colors.hoverBg} transition-colors overflow-hidden z-10 text-left shadow-sm ${
                    onShiftPointerDown ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                  }`}
                  style={{
                    top: Math.max(top, 0),
                    height: Math.max(height, 24),
                    left: `calc(${left}% + 4px)`,
                    width: `calc(${laneWidth}% - 8px)`,
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
                            date,
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
                      <div className="w-8 h-1 bg-current opacity-20 rounded-full mt-0.5" />
                    </div>
                  )}
                  <div className="px-2 py-1 leading-tight">
                    <div className="text-sm font-bold truncate">
                      {mode === "store"
                        ? shift.employee
                          ? `${shift.employee.firstName} ${shift.employee.lastName}`
                          : "NON ASSIGNÉ"
                        : shift.store.name}
                    </div>
                    <div className="text-xs opacity-80">
                      {shift.startTime} - {shift.endTime}
                    </div>
                    {(() => {
                      const violations = detectShiftViolations(shift, dayShifts, scheduleForDay);
                      if (violations.length === 0 || height <= 40) return null;
                      return (
                        <div className="text-[9px] font-bold text-red-600 bg-red-100 rounded px-1 mt-0.5 inline-block truncate">
                          {violations[0].message}
                        </div>
                      );
                    })()}
                    {multiStore && height > 40 && (
                      <div className="text-[10px] opacity-60 truncate">
                        {shift.store.name}
                      </div>
                    )}
                    {shiftHours > 6 && height > 50 && (
                      <div className="text-[10px] opacity-50 truncate">
                        pause 30min
                      </div>
                    )}
                    {shift.note && height > 70 && (
                      <div className="text-[11px] opacity-60 truncate mt-1 italic">
                        {shift.note}
                      </div>
                    )}
                  </div>
                  {/* Resize handle: bottom */}
                  {onShiftPointerDown && (
                    <div className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-20 flex items-end justify-center">
                      <div className="w-8 h-1 bg-current opacity-20 rounded-full mb-0.5" />
                    </div>
                  )}
                </button>
              );
            })}

            {/* Drag ghost */}
            {dragState?.isDragging && dragState.previewDate === date && (
              <ShiftDragGhost
                startMinutes={dragState.previewStartMinutes}
                endMinutes={dragState.previewEndMinutes}
                gridStartHour={gridStartHour}
                gridEndHour={gridEndHour}
                gridHeight={gridHeight}
                lane={dragState.lane}
                totalLanes={dragState.totalLanes}
              />
            )}

            {/* Current time indicator */}
            {today && nowInRange && (
              <div
                className="absolute left-0 right-0 z-30 pointer-events-none"
                style={{ top: nowOffset }}
              >
                <div className="flex items-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 h-[2px] bg-red-500" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coverage legend */}
        {mode === "store" && (
          <div className="border-t border-gray-200 px-4 py-2 flex items-center gap-4 text-[11px] text-gray-500 bg-gray-50">
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

      {/* Sidebar: employee summary */}
      {mode === "store" && (
        <div className="w-56 shrink-0 hidden lg:block">
          <div className="border border-gray-200 rounded-lg bg-white p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Effectifs du jour
            </h4>
            <div className="text-2xl font-bold text-gray-900 mb-3">
              {dayShifts.length}{" "}
              <span className="text-sm font-normal text-gray-500">
                shift{dayShifts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {employeeSummary.length > 0 ? (
              <div className="space-y-2">
                {employeeSummary.map((emp) => {
                  const colors = getEmployeeColor(emp.id === "__unassigned__" ? null : emp.id);
                  const hours = (emp.totalMinutes / 60).toFixed(1);
                  return (
                    <div
                      key={emp.id}
                      className={`flex items-center justify-between rounded px-2 py-1.5 text-xs ${colors.bg} ${colors.text}`}
                    >
                      <span className="font-medium truncate mr-2">
                        {emp.name}
                      </span>
                      <span className="shrink-0 opacity-80">{hours}h</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Aucun shift ce jour</p>
            )}

            {/* Total hours */}
            {employeeSummary.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs">
                <span className="text-gray-500">Total heures</span>
                <span className="font-bold text-gray-900">
                  {(
                    employeeSummary.reduce((sum, e) => sum + e.totalMinutes, 0) / 60
                  ).toFixed(1)}
                  h
                </span>
              </div>
            )}
          </div>

          {/* Coverage breakdown */}
          <div className="border border-gray-200 rounded-lg bg-white p-3 mt-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Couverture horaire
            </h4>
            <div className="space-y-0.5">
              {coverage.map((slot) => {
                const slotMin = slot.hour * 60;
                const isDuringOpen = !scheduleForDay || (isOpen && slotMin >= openMin && slotMin < closeMin);

                let barColor = "bg-gray-200";
                let textColor = "text-gray-400";
                if (!isDuringOpen) {
                  barColor = "bg-gray-200";
                  textColor = "text-gray-300";
                } else if (slot.count === 0) {
                  barColor = "bg-red-400";
                  textColor = "text-red-700";
                } else if (slot.count === 1) {
                  barColor = "bg-yellow-400";
                  textColor = "text-yellow-700";
                } else if (slot.count >= 2) {
                  barColor = "bg-green-400";
                  textColor = "text-green-700";
                }

                return (
                  <div key={slot.hour} className={`flex items-center gap-2 text-[11px] ${!isDuringOpen ? 'opacity-40' : ''}`}>
                    <span className="w-10 text-gray-400 text-right font-mono">
                      {slot.hour.toString().padStart(2, "0")}h
                    </span>
                    <div className="flex-1 h-3 bg-gray-100 rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-all`}
                        style={{
                          width: isDuringOpen ? `${Math.min(slot.count * 25, 100)}%` : '0%',
                        }}
                      />
                    </div>
                    <span className={`w-4 text-right font-bold ${textColor}`}>
                      {isDuringOpen ? slot.count : '–'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
