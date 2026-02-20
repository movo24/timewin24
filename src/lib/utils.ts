import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a "YYYY-MM-DD" string into a Date at UTC midnight.
 * This avoids timezone offset issues where "2025-02-18" in local
 * Paris time (UTC+1) would become "2025-02-17T23:00:00Z".
 */
export function toUTCDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getWeekBounds(dateStr: string): {
  weekStart: Date;
  weekEnd: Date;
} {
  const date = toUTCDate(dateStr);
  const day = date.getUTCDay();
  // Monday = start of week
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() + diff);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return { weekStart, weekEnd };
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getWeekDays(weekStartStr: string): Date[] {
  const start = toUTCDate(weekStartStr);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

export function getMondayOfWeek(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

const DAY_NAMES_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function getDayNameFr(dayIndex: number): string {
  return DAY_NAMES_FR[dayIndex] || "";
}
