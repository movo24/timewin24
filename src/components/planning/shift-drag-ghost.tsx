"use client";

import { minutesToTime } from "@/lib/timeline-utils";

interface ShiftDragGhostProps {
  startMinutes: number;
  endMinutes: number;
  gridStartHour: number;
  gridEndHour: number;
  gridHeight: number;
  lane: number;
  totalLanes: number;
  paddingLeft?: number;
}

export function ShiftDragGhost({
  startMinutes,
  endMinutes,
  gridStartHour,
  gridEndHour,
  gridHeight,
  lane,
  totalLanes,
  paddingLeft = 4,
}: ShiftDragGhostProps) {
  const totalMinutes = (gridEndHour - gridStartHour) * 60;
  const top = ((startMinutes - gridStartHour * 60) / totalMinutes) * gridHeight;
  const height = ((endMinutes - startMinutes) / totalMinutes) * gridHeight;
  const laneWidth = 100 / totalLanes;
  const left = lane * laneWidth;
  const durationMin = endMinutes - startMinutes;
  const durationStr =
    durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? (durationMin % 60).toString().padStart(2, "0") : ""}`
      : `${durationMin}min`;

  return (
    <div
      className="absolute rounded border-2 border-dashed border-blue-400 bg-blue-100/60 z-40 pointer-events-none will-change-transform"
      style={{
        top: Math.max(top, 0),
        height: Math.max(height, 24),
        left: `calc(${left}% + ${paddingLeft}px)`,
        width: `calc(${laneWidth}% - ${paddingLeft + 4}px)`,
      }}
    >
      {/* Time tooltip */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-50">
        <div className="bg-gray-900 text-white text-xs font-medium px-2.5 py-1 rounded-full shadow-lg">
          {minutesToTime(startMinutes)} – {minutesToTime(endMinutes)}
          <span className="ml-1.5 opacity-60 text-[10px]">{durationStr}</span>
        </div>
      </div>
    </div>
  );
}
