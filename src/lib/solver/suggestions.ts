/**
 * Cross-Store Suggestions — Post-solve analysis.
 *
 * After the solver runs, this module analyzes the results to detect
 * opportunities for employee moves between stores. It identifies
 * unassigned shifts and proposes employees from other stores who
 * could fill them.
 *
 * Pure functions, no DB access.
 */

import type {
  SolverResult,
  SolverInput,
  CrossStoreSuggestion,
  SolverEmployee,
} from "./types";

/**
 * Time helper
 */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calculateHoursFromTimes(startTime: string, endTime: string): number {
  return (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60;
}

function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay();
}

/**
 * Generate cross-store suggestions by analyzing unassigned shifts
 * and finding employees from other stores who could fill them.
 *
 * @param result - The solver result containing all generated shifts
 * @param inputs - All SolverInputs (one per store)
 * @returns Array of suggestions for employee moves
 */
export function generateCrossStoreSuggestions(
  result: SolverResult,
  inputs: SolverInput[]
): CrossStoreSuggestion[] {
  if (inputs.length < 2) return []; // Need at least 2 stores for cross-store suggestions

  const suggestions: CrossStoreSuggestion[] = [];

  // Find unassigned shifts
  const unassignedShifts = result.shifts.filter((s) => s.employeeId === null);
  if (unassignedShifts.length === 0) return [];

  // Build a map of all employees across all stores
  const employeeStoreMap = new Map<string, {
    employee: SolverEmployee;
    storeId: string;
    storeName: string;
  }>();

  for (const input of inputs) {
    for (const emp of input.employees) {
      if (!employeeStoreMap.has(emp.id)) {
        employeeStoreMap.set(emp.id, {
          employee: emp,
          storeId: input.store.id,
          storeName: input.store.name,
        });
      }
    }
  }

  // Calculate hours already assigned per employee in the result
  const employeeAssignedHours = new Map<string, number>();
  for (const shift of result.shifts) {
    if (!shift.employeeId) continue;
    employeeAssignedHours.set(
      shift.employeeId,
      (employeeAssignedHours.get(shift.employeeId) || 0) + shift.hours
    );
  }

  // For each unassigned shift, find potential employees from other stores
  for (const unassigned of unassignedShifts) {
    const shiftHours = calculateHoursFromTimes(unassigned.startTime, unassigned.endTime);
    const dayOfWeek = getDayOfWeek(unassigned.date);

    // Find the input for the target store to get schedule info
    const targetInput = inputs.find((i) => i.store.id === unassigned.storeId);
    if (!targetInput) continue;
    const targetSchedule = targetInput.store.schedules.get(dayOfWeek);
    if (!targetSchedule) continue;

    // Check employees from OTHER stores
    for (const [empId, empInfo] of employeeStoreMap) {
      // Skip employees from the same store
      if (empInfo.storeId === unassigned.storeId) continue;

      const emp = empInfo.employee;
      const currentHours = employeeAssignedHours.get(empId) || 0;
      const maxWeekly = emp.maxHoursPerWeek;
      const targetWeekly = emp.weeklyHours || 35;

      // Check if employee has remaining capacity
      if (currentHours + shiftHours > maxWeekly) continue;

      // Check basic availability (unavailabilities)
      let available = true;
      for (const u of emp.unavailabilities) {
        if (u.type === "FIXED" && u.dayOfWeek === dayOfWeek) {
          if (!u.startTime || !u.endTime) { available = false; break; }
          if (unassigned.startTime < u.endTime && u.startTime < unassigned.endTime) {
            available = false;
            break;
          }
        }
        if (u.type === "VARIABLE" && u.date === unassigned.date) {
          if (!u.startTime || !u.endTime) { available = false; break; }
          if (unassigned.startTime < u.endTime && u.startTime < unassigned.endTime) {
            available = false;
            break;
          }
        }
      }
      if (!available) continue;

      // Check no overlap with employee's existing/generated shifts
      let hasOverlap = false;
      for (const s of result.shifts) {
        if (s.employeeId !== empId || s.date !== unassigned.date) continue;
        if (unassigned.startTime < s.endTime && s.startTime < unassigned.endTime) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) continue;

      // Employee is a viable candidate — generate suggestion
      const remainingCapacity = targetWeekly - currentHours;
      suggestions.push({
        type: "MOVE_EMPLOYEE",
        employeeId: empId,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        fromStoreId: empInfo.storeId,
        fromStoreName: empInfo.storeName,
        toStoreId: unassigned.storeId,
        toStoreName: unassigned.storeName,
        date: unassigned.date,
        reason: `Disponible et ${remainingCapacity.toFixed(0)}h restantes`,
        impact: `Couvre le créneau ${unassigned.startTime}-${unassigned.endTime} non assigné`,
      });

      // Only suggest one employee per unassigned shift (the first viable one)
      break;
    }
  }

  return suggestions;
}
