/**
 * Pure utility functions for shift time calculations.
 * No database dependencies - safe for unit testing.
 */

export interface ShiftTime {
  date: string;
  startTime: string;
  endTime: string;
  id?: string;
}

/**
 * Check if two time ranges overlap on the same date.
 * Returns true if there IS an overlap.
 */
export function doTimesOverlap(a: ShiftTime, b: ShiftTime): boolean {
  if (a.date !== b.date) return false;
  // Same shift being edited - skip
  if (a.id && b.id && a.id === b.id) return false;
  // Overlap: a starts before b ends AND b starts before a ends
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Calculate hours from start/end time strings "HH:mm".
 */
export function calculateShiftHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}
