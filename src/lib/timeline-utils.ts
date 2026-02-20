/**
 * Timeline layout utilities.
 * Computes lane assignment for overlapping shifts so they render side-by-side.
 */

export interface TimelineShift {
  id: string;
  storeId: string;
  employeeId: string;
  date: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  note: string | null;
  store: { id: string; name: string };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    weeklyHours?: number | null;
  };
}

export interface PositionedShift extends TimelineShift {
  /** Which lane (column) this shift occupies (0-based) */
  lane: number;
  /** Total lanes in this overlap group */
  totalLanes: number;
  /** Start in minutes from midnight */
  startMinutes: number;
  /** End in minutes from midnight */
  endMinutes: number;
}

/** Convert "HH:mm" to minutes from midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convert minutes from midnight to "HH:mm" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Check if two shifts overlap in time */
function shiftsOverlap(a: { startMinutes: number; endMinutes: number }, b: { startMinutes: number; endMinutes: number }): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/**
 * Assign lanes to a list of shifts for a single day.
 * Uses a greedy interval colouring algorithm.
 * Returns the positioned shifts with lane info.
 */
export function assignLanes(shifts: TimelineShift[]): PositionedShift[] {
  if (shifts.length === 0) return [];

  // Convert and sort by start time, then by end time
  const items = shifts.map((s) => ({
    ...s,
    startMinutes: timeToMinutes(s.startTime),
    endMinutes: timeToMinutes(s.endTime),
    lane: 0,
    totalLanes: 1,
  }));

  items.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  // Step 1: Find overlap groups (connected components of overlapping shifts)
  const groups: PositionedShift[][] = [];
  let currentGroup: PositionedShift[] = [];
  let groupEnd = -1;

  for (const item of items) {
    if (currentGroup.length === 0 || item.startMinutes < groupEnd) {
      // Overlaps with current group
      currentGroup.push(item);
      groupEnd = Math.max(groupEnd, item.endMinutes);
    } else {
      // New group
      groups.push(currentGroup);
      currentGroup = [item];
      groupEnd = item.endMinutes;
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  // Step 2: Within each group, assign lanes greedily
  const result: PositionedShift[] = [];

  for (const group of groups) {
    const laneEnds: number[] = []; // Tracks end time of last shift in each lane

    for (const shift of group) {
      // Find the first lane where this shift fits (doesn't overlap)
      let assigned = -1;
      for (let l = 0; l < laneEnds.length; l++) {
        if (laneEnds[l] <= shift.startMinutes) {
          assigned = l;
          break;
        }
      }
      if (assigned === -1) {
        assigned = laneEnds.length;
        laneEnds.push(0);
      }
      shift.lane = assigned;
      laneEnds[assigned] = shift.endMinutes;
    }

    const totalLanes = laneEnds.length;
    for (const shift of group) {
      shift.totalLanes = totalLanes;
      result.push(shift);
    }
  }

  return result;
}

/**
 * Calculate coverage: number of employees present per hour slot.
 * Returns an array from gridStart to gridEnd (exclusive), one entry per hour.
 */
export function calculateCoverage(
  shifts: TimelineShift[],
  gridStartHour: number,
  gridEndHour: number
): { hour: number; count: number }[] {
  const coverage: { hour: number; count: number }[] = [];

  for (let h = gridStartHour; h < gridEndHour; h++) {
    const slotStart = h * 60;
    const slotEnd = (h + 1) * 60;
    let count = 0;
    for (const shift of shifts) {
      const sStart = timeToMinutes(shift.startTime);
      const sEnd = timeToMinutes(shift.endTime);
      // Shift is present during this hour if it overlaps with [slotStart, slotEnd)
      if (sStart < slotEnd && sEnd > slotStart) {
        count++;
      }
    }
    coverage.push({ hour: h, count });
  }

  return coverage;
}

/** Get a deterministic color for an employee based on their ID */
const EMPLOYEE_COLORS = [
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-900", hoverBg: "hover:bg-blue-200" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-900", hoverBg: "hover:bg-emerald-200" },
  { bg: "bg-violet-100", border: "border-violet-300", text: "text-violet-900", hoverBg: "hover:bg-violet-200" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-900", hoverBg: "hover:bg-amber-200" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-900", hoverBg: "hover:bg-rose-200" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-900", hoverBg: "hover:bg-cyan-200" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-900", hoverBg: "hover:bg-orange-200" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-900", hoverBg: "hover:bg-teal-200" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-900", hoverBg: "hover:bg-indigo-200" },
  { bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-900", hoverBg: "hover:bg-pink-200" },
  { bg: "bg-lime-100", border: "border-lime-300", text: "text-lime-900", hoverBg: "hover:bg-lime-200" },
  { bg: "bg-fuchsia-100", border: "border-fuchsia-300", text: "text-fuchsia-900", hoverBg: "hover:bg-fuchsia-200" },
];

export function getEmployeeColor(employeeId: string) {
  // Simple hash from ID
  let hash = 0;
  for (let i = 0; i < employeeId.length; i++) {
    hash = ((hash << 5) - hash + employeeId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % EMPLOYEE_COLORS.length;
  return EMPLOYEE_COLORS[idx];
}
