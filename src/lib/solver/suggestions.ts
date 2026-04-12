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
  SolverShift,
} from "./types";
import { isStoreOverlapCompliant, isUnderMaxSimultaneous, isUnderMaxDistinctEmployees } from "./constraints";

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

  // Pre-build a SolverShift[] view of all assigned result shifts (for constraint helpers)
  const assignedResultShifts: SolverShift[] = result.shifts
    .filter((s) => s.employeeId !== null)
    .map((s) => ({
      employeeId: s.employeeId,
      storeId: s.storeId,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      hours: s.hours,
    }));

  // Find unassigned shifts
  const unassignedShifts = result.shifts.filter((s) => s.employeeId === null);
  if (unassignedShifts.length === 0) return [];

  // Build a map of all employees across all stores (primary store = first store they appear in)
  const employeeStoreMap = new Map<string, {
    employee: SolverEmployee;
    storeId: string;
    storeName: string;
  }>();

  // Track which stores each employee is authorized for (appears in their StoreEmployee pool)
  const employeeAuthorizedStores = new Map<string, Set<string>>();

  for (const input of inputs) {
    for (const emp of input.employees) {
      if (!employeeStoreMap.has(emp.id)) {
        employeeStoreMap.set(emp.id, {
          employee: emp,
          storeId: input.store.id,
          storeName: input.store.name,
        });
      }
      // Register this store as authorized for this employee
      const authorized = employeeAuthorizedStores.get(emp.id) ?? new Set<string>();
      authorized.add(input.store.id);
      employeeAuthorizedStores.set(emp.id, authorized);
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

  // Deduplication key: one suggestion per (employeeId, date, toStoreId)
  const suggestionKeys = new Set<string>();

  // For each unassigned shift, find potential employees from other stores
  for (const unassigned of unassignedShifts) {
    const shiftHours = calculateHoursFromTimes(unassigned.startTime, unassigned.endTime);
    const dayOfWeek = getDayOfWeek(unassigned.date);

    // Find the input for the target store to get schedule info
    const targetInput = inputs.find((i) => i.store.id === unassigned.storeId);
    if (!targetInput) continue;
    const targetSchedule = targetInput.store.schedules.get(dayOfWeek);
    if (!targetSchedule) continue;

    // Build the authorized employee set for the target store
    const targetStoreEmployeeIds = new Set(targetInput.employees.map((e) => e.id));

    // Check employees from OTHER stores
    for (const [empId, empInfo] of employeeStoreMap) {
      // Skip employees from the same store as the unassigned shift
      if (empInfo.storeId === unassigned.storeId) continue;

      // AUTHORIZATION: employee must be in the target store's authorized pool
      if (!targetStoreEmployeeIds.has(empId)) continue;

      // DEDUPLICATION: skip if we already suggested this employee for this store+day
      const dedupKey = `${empId}||${unassigned.storeId}||${unassigned.date}`;
      if (suggestionKeys.has(dedupKey)) continue;

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

      // Check no overlap with employee's existing/generated shifts (employee can't be in two places)
      let hasEmployeeOverlap = false;
      for (const s of result.shifts) {
        if (s.employeeId !== empId || s.date !== unassigned.date) continue;
        if (unassigned.startTime < s.endTime && s.startTime < unassigned.endTime) {
          hasEmployeeOverlap = true;
          break;
        }
      }
      if (hasEmployeeOverlap) continue;

      // Check target store overlap compliance (respects maxOverlapMinutes, not just boolean overlap)
      if (!isStoreOverlapCompliant(
        unassigned.storeId,
        unassigned.date,
        unassigned.startTime,
        unassigned.endTime,
        empId,
        targetInput.store.maxOverlapMinutes,
        [], // no DB-loaded existing shifts in this context
        assignedResultShifts,
      )) continue;

      // Check target store maxSimultaneous constraint
      // (targetSchedule already resolved in outer loop scope)
      const effectiveMaxSimultaneous =
        targetSchedule?.maxSimultaneous ?? targetInput.store.maxSimultaneous;
      if (!isUnderMaxSimultaneous(
        unassigned.storeId,
        unassigned.date,
        unassigned.startTime,
        unassigned.endTime,
        effectiveMaxSimultaneous,
        [],
        assignedResultShifts,
      )) continue;

      // Check target store maxEmployees (distinct employees per day) constraint
      const effectiveMaxEmployees =
        targetSchedule?.maxEmployees ?? targetInput.store.maxEmployees;
      if (!isUnderMaxDistinctEmployees(
        empId,
        unassigned.storeId,
        unassigned.date,
        effectiveMaxEmployees,
        [],
        assignedResultShifts,
      )) continue;

      // Employee is a viable candidate — generate suggestion
      const remainingCapacity = targetWeekly - currentHours;
      suggestionKeys.add(`${empId}||${unassigned.storeId}||${unassigned.date}`);
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
