/**
 * Manager IA — Layer 3: Planner
 *
 * Valide les contraintes métier et génère des propositions d'actions.
 * Réutilise les hard constraints du solver existant.
 * Ne jamais bloquer : toujours proposer une alternative.
 */

import type {
  ResolvedCommand,
  Proposal,
  ProposalAction,
  Alternative,
  QueryResult,
  AvailableEmployee,
  PlanningIssue,
  PlanningScore,
  EmployeeScheduleEntry,
} from "./types";

// ─── Planner Context ────────────────────────────

export interface PlannerEmployee {
  id: string;
  firstName: string;
  lastName: string;
  weeklyHours: number | null;
  maxHoursPerDay: number;
  maxHoursPerWeek: number;
  minRestBetween: number;
  shiftPreference: "MATIN" | "APRES_MIDI" | "JOURNEE";
  unavailabilities: {
    type: "FIXED" | "VARIABLE";
    dayOfWeek: number | null;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
  }[];
  stores: { storeId: string }[];
}

export interface PlannerStore {
  id: string;
  name: string;
  minEmployees: number;
  schedules: {
    dayOfWeek: number;
    closed: boolean;
    openTime: string | null;
    closeTime: string | null;
    minEmployees: number | null;
  }[];
}

export interface PlannerShift {
  id: string;
  employeeId: string | null;
  storeId: string;
  storeName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface PlannerContext {
  employees: PlannerEmployee[];
  stores: PlannerStore[];
  shifts: PlannerShift[];
  weekStart: string;
}

// ─── Time Helpers ───────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function shiftHours(start: string, end: string): number {
  return (timeToMin(end) - timeToMin(start)) / 60;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// ─── Constraint Checks ─────────────────────────

function hasOverlap(
  employeeId: string,
  date: string,
  startTime: string,
  endTime: string,
  shifts: PlannerShift[],
  excludeShiftId?: string
): PlannerShift | null {
  const normalizedDate = date.split("T")[0];
  for (const s of shifts) {
    if (s.id === excludeShiftId) continue;
    if (s.employeeId !== employeeId) continue;
    if (s.date.split("T")[0] !== normalizedDate) continue;
    if (startTime < s.endTime && s.startTime < endTime) return s;
  }
  return null;
}

function isAvailable(
  employee: PlannerEmployee,
  date: string,
  startTime: string,
  endTime: string
): { available: boolean; reason: string | null } {
  const d = parseDate(date);
  const dayOfWeek = d.getUTCDay();

  for (const u of employee.unavailabilities) {
    if (u.type === "FIXED" && u.dayOfWeek === dayOfWeek) {
      if (!u.startTime || !u.endTime) {
        return { available: false, reason: `${employee.firstName} est indisponible ce jour (indisponibilité récurrente)` };
      }
      if (startTime < u.endTime && u.startTime < endTime) {
        return { available: false, reason: `${employee.firstName} est indisponible de ${u.startTime} à ${u.endTime}` };
      }
    }
    if (u.type === "VARIABLE" && u.date === date) {
      if (!u.startTime || !u.endTime) {
        return { available: false, reason: `${employee.firstName} est indisponible le ${date} (congé)` };
      }
      if (startTime < u.endTime && u.startTime < endTime) {
        return { available: false, reason: `${employee.firstName} est indisponible de ${u.startTime} à ${u.endTime} le ${date}` };
      }
    }
  }
  return { available: true, reason: null };
}

function getDailyHours(
  employeeId: string,
  date: string,
  shifts: PlannerShift[],
  excludeShiftId?: string
): number {
  const normalizedDate = date.split("T")[0];
  let total = 0;
  for (const s of shifts) {
    if (s.id === excludeShiftId) continue;
    if (s.employeeId !== employeeId) continue;
    if (s.date.split("T")[0] !== normalizedDate) continue;
    total += shiftHours(s.startTime, s.endTime);
  }
  return total;
}

function getWeeklyHours(
  employeeId: string,
  weekStart: string,
  shifts: PlannerShift[],
  excludeShiftId?: string
): number {
  const ws = parseDate(weekStart);
  const we = new Date(ws);
  we.setUTCDate(we.getUTCDate() + 7);
  const wsStr = weekStart;
  const weStr = we.toISOString().split("T")[0];

  let total = 0;
  for (const s of shifts) {
    if (s.id === excludeShiftId) continue;
    if (s.employeeId !== employeeId) continue;
    const sDate = s.date.split("T")[0];
    if (sDate >= wsStr && sDate < weStr) {
      total += shiftHours(s.startTime, s.endTime);
    }
  }
  return total;
}

function getEnoughRest(
  employeeId: string,
  date: string,
  startTime: string,
  minRestHours: number,
  shifts: PlannerShift[],
  excludeShiftId?: string
): { ok: boolean; reason: string | null } {
  const normalizedDate = date.split("T")[0];
  const targetStart = parseDate(normalizedDate).getTime() + timeToMin(startTime) * 60000;

  for (const s of shifts) {
    if (s.id === excludeShiftId) continue;
    if (s.employeeId !== employeeId) continue;

    const sDate = s.date.split("T")[0];
    const sEnd = parseDate(sDate).getTime() + timeToMin(s.endTime) * 60000;

    const gapMs = targetStart - sEnd;
    if (gapMs >= 0 && gapMs < minRestHours * 3600000) {
      const gapH = (gapMs / 3600000).toFixed(1);
      return {
        ok: false,
        reason: `Repos insuffisant : seulement ${gapH}h entre le shift précédent (fin ${s.endTime}) et ${startTime}. Minimum : ${minRestHours}h.`,
      };
    }
  }
  return { ok: true, reason: null };
}

function isStoreOpen(
  store: PlannerStore,
  date: string
): { open: boolean; schedule: PlannerStore["schedules"][0] | null } {
  const d = parseDate(date);
  const dayOfWeek = d.getUTCDay();
  const schedule = store.schedules.find((s) => s.dayOfWeek === dayOfWeek);
  if (!schedule || schedule.closed) {
    return { open: false, schedule: null };
  }
  return { open: true, schedule };
}

function isAuthorizedStore(employee: PlannerEmployee, storeId: string): boolean {
  return employee.stores.some((s) => s.storeId === storeId);
}

// ─── Validate Full Constraints for CREATE ───────

function validateCreate(
  employee: PlannerEmployee,
  storeId: string,
  storeName: string,
  date: string,
  startTime: string,
  endTime: string,
  ctx: PlannerContext,
  excludeShiftId?: string
): { valid: boolean; warnings: string[]; blockers: string[] } {
  const warnings: string[] = [];
  const blockers: string[] = [];

  // Store open?
  const store = ctx.stores.find((s) => s.id === storeId);
  if (store) {
    const { open, schedule } = isStoreOpen(store, date);
    if (!open) {
      blockers.push(`Le magasin ${storeName} est fermé ce jour.`);
    } else if (schedule) {
      if (schedule.openTime && startTime < schedule.openTime) {
        blockers.push(`Le shift commence avant l'ouverture du magasin (${schedule.openTime}).`);
      }
      if (schedule.closeTime && endTime > schedule.closeTime) {
        blockers.push(`Le shift se termine après la fermeture du magasin (${schedule.closeTime}).`);
      }
    }
  }

  // Authorized store?
  if (!isAuthorizedStore(employee, storeId)) {
    blockers.push(`${employee.firstName} n'est pas autorisé(e) à travailler au magasin ${storeName}.`);
  }

  // Availability
  const { available, reason: availReason } = isAvailable(employee, date, startTime, endTime);
  if (!available && availReason) {
    blockers.push(availReason);
  }

  // Overlap
  const overlap = hasOverlap(employee.id, date, startTime, endTime, ctx.shifts, excludeShiftId);
  if (overlap) {
    blockers.push(
      `Conflit : ${employee.firstName} travaille déjà de ${overlap.startTime} à ${overlap.endTime} ce jour.`
    );
  }

  // Daily max
  const dailyH = getDailyHours(employee.id, date, ctx.shifts, excludeShiftId);
  const newHours = shiftHours(startTime, endTime);
  if (dailyH + newHours > employee.maxHoursPerDay) {
    blockers.push(
      `Maximum heures/jour dépassé : ${(dailyH + newHours).toFixed(1)}h (max ${employee.maxHoursPerDay}h).`
    );
  }

  // Weekly max
  const weeklyH = getWeeklyHours(employee.id, ctx.weekStart, ctx.shifts, excludeShiftId);
  if (weeklyH + newHours > employee.maxHoursPerWeek) {
    blockers.push(
      `Maximum heures/semaine dépassé : ${(weeklyH + newHours).toFixed(1)}h (max ${employee.maxHoursPerWeek}h).`
    );
  }

  // Weekly target warning
  if (employee.weeklyHours && weeklyH + newHours > employee.weeklyHours) {
    warnings.push(
      `${employee.firstName} dépassera son contrat : ${(weeklyH + newHours).toFixed(1)}h (contrat ${employee.weeklyHours}h).`
    );
  }

  // Rest
  const { ok: restOk, reason: restReason } = getEnoughRest(
    employee.id, date, startTime, employee.minRestBetween, ctx.shifts, excludeShiftId
  );
  if (!restOk && restReason) {
    blockers.push(restReason);
  }

  // Shift too long
  if (newHours > 10) {
    blockers.push(`Shift trop long : ${newHours.toFixed(1)}h (max 10h).`);
  } else if (newHours > 8) {
    warnings.push(`Shift long : ${newHours.toFixed(1)}h.`);
  }

  // Break needed
  if (newHours > 6) {
    warnings.push(`Pause de 30 min recommandée (shift > 6h).`);
  }

  return { valid: blockers.length === 0, warnings, blockers };
}

// ─── Plan CREATE ────────────────────────────────

function planCreate(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee, store, date, startTime, endTime } = cmd;
  const actions: ProposalAction[] = [];
  const warnings: string[] = [];
  const alternatives: Alternative[] = [];

  if (!employee || !date) {
    return makeErrorProposal(cmd, cmd.errors);
  }

  // Default store: employee's first authorized store
  const targetStore = store || findDefaultStore(employee, ctx);
  if (!targetStore) {
    return makeErrorProposal(cmd, ["Aucun magasin spécifié et aucun magasin par défaut trouvé."]);
  }

  // Default times if not specified
  const storeData = ctx.stores.find((s) => s.id === targetStore.id);
  const dayOfWeek = parseDate(date).getUTCDay();
  const schedule = storeData?.schedules.find((s) => s.dayOfWeek === dayOfWeek);

  let finalStart = startTime || schedule?.openTime || "09:00";
  let finalEnd = endTime || null;

  // Clamp start/end to store hours — never before opening or after closing
  if (schedule?.openTime && finalStart < schedule.openTime) {
    finalStart = schedule.openTime;
  }

  // If no end time, default to 7h shift or until close
  if (!finalEnd) {
    const startMin = timeToMin(finalStart);
    const closeMin = schedule?.closeTime ? timeToMin(schedule.closeTime) : startMin + 420;
    const defaultEnd = Math.min(startMin + 420, closeMin); // 7h max
    finalEnd = minToTime(defaultEnd);
  }

  // Clamp end to store closing
  if (schedule?.closeTime && finalEnd > schedule.closeTime) {
    finalEnd = schedule.closeTime;
  }

  // Validate
  const emp = ctx.employees.find((e) => e.id === employee.id);
  if (!emp) {
    return makeErrorProposal(cmd, [`Employé ${employee.firstName} non trouvé dans le contexte.`]);
  }

  const validation = validateCreate(emp, targetStore.id, targetStore.name, date, finalStart, finalEnd, ctx);

  if (validation.valid) {
    actions.push({
      type: "create",
      storeId: targetStore.id,
      storeName: targetStore.name,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      date,
      startTime: finalStart,
      endTime: finalEnd,
      explanation: `Créer un shift pour ${employee.firstName} le ${date} de ${finalStart} à ${finalEnd} au ${targetStore.name}.`,
    });
    warnings.push(...validation.warnings);
  } else {
    // Blocked — try alternatives
    warnings.push(...validation.blockers);

    // Alt 1: Try different time
    if (schedule?.openTime && schedule?.closeTime) {
      const altActions = tryAlternativeTimes(emp, targetStore, date, schedule, ctx);
      if (altActions.length > 0) {
        alternatives.push({
          description: `Autre créneau disponible pour ${employee.firstName}`,
          actions: altActions,
        });
      }
    }

    // Alt 2: Try different employee
    const altEmployee = tryAlternativeEmployee(targetStore.id, date, finalStart, finalEnd, ctx, employee.id);
    if (altEmployee) {
      alternatives.push(altEmployee);
    }
  }

  const explanation = actions.length > 0
    ? `${employee.firstName} ${employee.lastName} → ${targetStore.name}, le ${date}, ${finalStart}–${finalEnd}`
    : `Impossible de placer ${employee.firstName} : ${validation.blockers.join(" ")}`;

  return {
    actions,
    warnings,
    alternatives,
    explanation,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Plan MOVE ──────────────────────────────────

function planMove(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee, shift, targetDate, store } = cmd;
  const actions: ProposalAction[] = [];
  const warnings: string[] = [];

  if (!employee || !shift) {
    return makeErrorProposal(cmd, cmd.errors);
  }

  const newDate = targetDate || cmd.date;
  if (!newDate) {
    return makeErrorProposal(cmd, ["Date de destination non spécifiée."]);
  }

  const targetStore = store || ctx.stores.find((s) => s.id === shift.storeId);
  if (!targetStore) {
    return makeErrorProposal(cmd, ["Magasin non trouvé."]);
  }

  const emp = ctx.employees.find((e) => e.id === employee.id);
  if (!emp) {
    return makeErrorProposal(cmd, [`Employé non trouvé.`]);
  }

  const newStart = cmd.startTime || shift.startTime;
  const newEnd = cmd.endTime || shift.endTime;

  const validation = validateCreate(emp, targetStore.id, targetStore.name, newDate, newStart, newEnd, ctx, shift.id);

  if (validation.valid) {
    // Delete old shift
    actions.push({
      type: "delete",
      shiftId: shift.id,
      storeId: shift.storeId,
      storeName: ctx.shifts.find((s) => s.id === shift.id)?.storeName || "",
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      explanation: `Supprimer le shift existant du ${shift.date} (${shift.startTime}–${shift.endTime}).`,
    });

    // Create new shift
    actions.push({
      type: "create",
      storeId: targetStore.id,
      storeName: targetStore.name,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      date: newDate,
      startTime: newStart,
      endTime: newEnd,
      explanation: `Créer le nouveau shift le ${newDate} (${newStart}–${newEnd}) au ${targetStore.name}.`,
    });

    warnings.push(...validation.warnings);
  } else {
    warnings.push(...validation.blockers);
  }

  return {
    actions,
    warnings,
    alternatives: [],
    explanation: actions.length > 0
      ? `Déplacer ${employee.firstName} du ${shift.date} au ${newDate} (${newStart}–${newEnd})`
      : `Impossible de déplacer : ${validation.blockers.join(" ")}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Plan DELETE ────────────────────────────────

function planDelete(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee, shift } = cmd;
  const warnings: string[] = [];

  if (!shift) {
    return makeErrorProposal(cmd, cmd.errors);
  }

  const shiftData = ctx.shifts.find((s) => s.id === shift.id);
  const storeName = shiftData?.storeName || "";

  // Check if deletion creates coverage gap
  const normalizedDate = shift.date.split("T")[0];
  const storeData = ctx.stores.find((s) => s.id === shift.storeId);
  if (storeData) {
    const dayShifts = ctx.shifts.filter(
      (s) => s.storeId === shift.storeId && s.date.split("T")[0] === normalizedDate && s.id !== shift.id
    );
    const { schedule } = isStoreOpen(storeData, normalizedDate);
    const minEmp = schedule?.minEmployees ?? storeData.minEmployees;
    if (dayShifts.length < minEmp) {
      warnings.push(`Attention : en supprimant ce shift, il ne restera que ${dayShifts.length} employé(s) ce jour (minimum : ${minEmp}).`);
    }
  }

  const empName = employee
    ? `${employee.firstName} ${employee.lastName}`
    : "Non assigné";

  return {
    actions: [{
      type: "delete",
      shiftId: shift.id,
      storeId: shift.storeId,
      storeName,
      employeeId: shift.employeeId,
      employeeName: empName,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      explanation: `Supprimer le shift de ${empName} le ${shift.date} (${shift.startTime}–${shift.endTime}).`,
    }],
    warnings,
    alternatives: [],
    explanation: `Supprimer le shift de ${empName} le ${shift.date} (${shift.startTime}–${shift.endTime}) au ${storeName}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Plan SHORTEN ───────────────────────────────

function planShorten(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee, shift, duration } = cmd;

  if (!shift || !employee) {
    return makeErrorProposal(cmd, cmd.errors);
  }

  const shiftData = ctx.shifts.find((s) => s.id === shift.id);
  const storeName = shiftData?.storeName || "";
  const durationMin = duration || 60; // default: 1h

  // Shorten from the end
  const currentEnd = timeToMin(shift.endTime);
  const newEnd = minToTime(currentEnd - durationMin);

  if (timeToMin(newEnd) <= timeToMin(shift.startTime)) {
    return makeErrorProposal(cmd, ["Impossible : le shift serait trop court après réduction."]);
  }

  return {
    actions: [{
      type: "update",
      shiftId: shift.id,
      storeId: shift.storeId,
      storeName,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      date: shift.date,
      startTime: shift.startTime,
      endTime: newEnd,
      explanation: `Raccourcir le shift : fin ${shift.endTime} → ${newEnd} (-${durationMin}min).`,
    }],
    warnings: [],
    alternatives: [],
    explanation: `Raccourcir le shift de ${employee.firstName} : ${shift.startTime}–${shift.endTime} → ${shift.startTime}–${newEnd}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Plan EXTEND ────────────────────────────────

function planExtend(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee, shift, duration, endTime } = cmd;
  const warnings: string[] = [];

  if (!shift || !employee) {
    return makeErrorProposal(cmd, cmd.errors);
  }

  const shiftData = ctx.shifts.find((s) => s.id === shift.id);
  const storeName = shiftData?.storeName || "";

  let newEnd: string;
  if (endTime) {
    // "jusqu'à 18h"
    newEnd = endTime;
  } else {
    const durationMin = duration || 60;
    const currentEnd = timeToMin(shift.endTime);
    newEnd = minToTime(currentEnd + durationMin);
  }

  // Check constraints
  const emp = ctx.employees.find((e) => e.id === employee.id);
  if (emp) {
    const newHours = shiftHours(shift.startTime, newEnd);
    if (newHours > emp.maxHoursPerDay) {
      warnings.push(`Le shift prolongé (${newHours.toFixed(1)}h) dépasse le max journalier (${emp.maxHoursPerDay}h).`);
    }
    if (newHours > 6) {
      warnings.push("Pause de 30 min recommandée (shift > 6h).");
    }

    // Check overlap with next shift
    const overlap = hasOverlap(employee.id, shift.date, shift.startTime, newEnd, ctx.shifts, shift.id);
    if (overlap) {
      return makeErrorProposal(cmd, [
        `Conflit : prolonger jusqu'à ${newEnd} chevauche le shift suivant (${overlap.startTime}–${overlap.endTime}).`
      ]);
    }
  }

  return {
    actions: [{
      type: "update",
      shiftId: shift.id,
      storeId: shift.storeId,
      storeName,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      date: shift.date,
      startTime: shift.startTime,
      endTime: newEnd,
      explanation: `Prolonger le shift : fin ${shift.endTime} → ${newEnd}.`,
    }],
    warnings,
    alternatives: [],
    explanation: `Prolonger le shift de ${employee.firstName} : ${shift.startTime}–${shift.endTime} → ${shift.startTime}–${newEnd}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Plan ADD_BREAK ─────────────────────────────

function planAddBreak(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee, shift, duration } = cmd;

  if (!shift || !employee) {
    return makeErrorProposal(cmd, cmd.errors);
  }

  const shiftData = ctx.shifts.find((s) => s.id === shift.id);
  const storeName = shiftData?.storeName || "";
  const breakMinutes = duration || 30; // default 30 min

  // Place break in the middle of the shift
  const startMin = timeToMin(shift.startTime);
  const endMin = timeToMin(shift.endTime);
  const midpoint = Math.floor((startMin + endMin) / 2);
  const breakStart = minToTime(midpoint - Math.floor(breakMinutes / 2));
  const breakEnd = minToTime(midpoint + Math.ceil(breakMinutes / 2));

  const empName = `${employee.firstName} ${employee.lastName}`;

  return {
    actions: [
      // Delete original shift
      {
        type: "delete",
        shiftId: shift.id,
        storeId: shift.storeId,
        storeName,
        employeeId: employee.id,
        employeeName: empName,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        explanation: `Supprimer le shift original (${shift.startTime}–${shift.endTime}).`,
      },
      // Create first half
      {
        type: "create",
        storeId: shift.storeId,
        storeName,
        employeeId: employee.id,
        employeeName: empName,
        date: shift.date,
        startTime: shift.startTime,
        endTime: breakStart,
        explanation: `Créer shift matin : ${shift.startTime}–${breakStart}.`,
      },
      // Create second half
      {
        type: "create",
        storeId: shift.storeId,
        storeName,
        employeeId: employee.id,
        employeeName: empName,
        date: shift.date,
        startTime: breakEnd,
        endTime: shift.endTime,
        explanation: `Créer shift après-midi : ${breakEnd}–${shift.endTime}.`,
      },
    ],
    warnings: [],
    alternatives: [],
    explanation: `Ajouter une pause de ${breakMinutes}min (${breakStart}–${breakEnd}) dans le shift de ${employee.firstName}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Plan FILL_GAPS ─────────────────────────────

function planFillGaps(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { date, store } = cmd;
  const actions: ProposalAction[] = [];
  const warnings: string[] = [];

  if (!date) {
    return makeErrorProposal(cmd, ["Aucune date spécifiée pour remplir les trous."]);
  }

  const targetStores = store
    ? [ctx.stores.find((s) => s.id === store.id)].filter(Boolean) as PlannerStore[]
    : ctx.stores;

  for (const targetStore of targetStores) {
    const { open, schedule } = isStoreOpen(targetStore, date);
    if (!open || !schedule?.openTime || !schedule?.closeTime) continue;

    const normalizedDate = date.split("T")[0];
    const storeShifts = ctx.shifts.filter(
      (s) => s.storeId === targetStore.id && s.date.split("T")[0] === normalizedDate && s.employeeId
    );

    const openMin = timeToMin(schedule.openTime);
    const closeMin = timeToMin(schedule.closeTime);

    // Find uncovered time ranges (sweep-line)
    const covered = storeShifts
      .map((s) => ({ start: Math.max(openMin, timeToMin(s.startTime)), end: Math.min(closeMin, timeToMin(s.endTime)) }))
      .filter((r) => r.start < r.end)
      .sort((a, b) => a.start - b.start);

    // Merge overlapping covered ranges
    const merged: { start: number; end: number }[] = [];
    for (const r of covered) {
      if (merged.length === 0 || r.start > merged[merged.length - 1].end) {
        merged.push({ ...r });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
      }
    }

    // Find gaps
    const gaps: { start: number; end: number }[] = [];
    let cursor = openMin;
    for (const r of merged) {
      if (cursor < r.start) gaps.push({ start: cursor, end: r.start });
      cursor = Math.max(cursor, r.end);
    }
    if (cursor < closeMin) gaps.push({ start: cursor, end: closeMin });

    if (gaps.length === 0) continue;

    // For each gap, find an available employee
    const usedEmployeeIds = storeShifts.map((s) => s.employeeId).filter(Boolean) as string[];

    for (const gap of gaps) {
      const gapStart = minToTime(gap.start);
      const gapEnd = minToTime(gap.end);

      const availableEmp = findAvailableEmployee(
        targetStore.id, date, gapStart, gapEnd, ctx, usedEmployeeIds
      );

      if (availableEmp) {
        actions.push({
          type: "create",
          storeId: targetStore.id,
          storeName: targetStore.name,
          employeeId: availableEmp.id,
          employeeName: `${availableEmp.firstName} ${availableEmp.lastName}`,
          date,
          startTime: gapStart,
          endTime: gapEnd,
          explanation: `${availableEmp.firstName} pour couvrir ${targetStore.name} de ${gapStart} à ${gapEnd}.`,
        });
        usedEmployeeIds.push(availableEmp.id);
      } else {
        actions.push({
          type: "create",
          storeId: targetStore.id,
          storeName: targetStore.name,
          employeeId: null,
          employeeName: "Non assigné",
          date,
          startTime: gapStart,
          endTime: gapEnd,
          explanation: `Shift non assigné (${gapStart}–${gapEnd}) — aucun employé disponible.`,
        });
        warnings.push(`Pas assez d'employés pour couvrir ${targetStore.name} de ${gapStart} à ${gapEnd}.`);
      }
    }
  }

  if (actions.length === 0) {
    return {
      actions: [],
      warnings: [],
      alternatives: [],
      explanation: "Aucun trou de couverture détecté pour ce jour.",
      parsedIntent: cmd as unknown as Proposal["parsedIntent"],
      resolvedCommand: cmd,
    };
  }

  return {
    actions,
    warnings,
    alternatives: [],
    explanation: `${actions.length} shift(s) à ajouter pour combler les trous de couverture le ${date}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Plan OPTIMIZE_DAY / OPTIMIZE_WEEK ──────────

function planOptimize(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  // For optimize, we inform the user to use the auto-plan feature
  // as it uses the full solver engine
  const scope = cmd.action === "OPTIMIZE_WEEK" ? "la semaine" : `le ${cmd.date || "jour"}`;

  return {
    actions: [],
    warnings: [],
    alternatives: [],
    explanation: `Pour optimiser ${scope}, utilisez l'auto-planification (bouton "Auto-planifier") qui évalue plusieurs scénarios et choisit le meilleur.`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

// ─── Helpers ────────────────────────────────────

function makeErrorProposal(cmd: ResolvedCommand, errors: string[]): Proposal {
  return {
    actions: [],
    warnings: errors,
    alternatives: [],
    explanation: errors.join(" "),
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
  };
}

function findDefaultStore(
  employee: { id: string; firstName: string; lastName: string },
  ctx: PlannerContext
): { id: string; name: string } | null {
  const emp = ctx.employees.find((e) => e.id === employee.id);
  if (!emp || emp.stores.length === 0) return null;

  const storeId = emp.stores[0].storeId;
  const store = ctx.stores.find((s) => s.id === storeId);
  if (!store) return null;

  return { id: store.id, name: store.name };
}

function tryAlternativeTimes(
  employee: PlannerEmployee,
  store: { id: string; name: string },
  date: string,
  schedule: { openTime: string | null; closeTime: string | null },
  ctx: PlannerContext
): ProposalAction[] {
  if (!schedule.openTime || !schedule.closeTime) return [];

  const openMin = timeToMin(schedule.openTime);
  const closeMin = timeToMin(schedule.closeTime);
  const slots = [
    { start: openMin, end: Math.min(openMin + 420, closeMin) }, // matin 7h
    { start: Math.max(closeMin - 420, openMin), end: closeMin }, // après-midi 7h
  ];

  for (const slot of slots) {
    const start = minToTime(slot.start);
    const end = minToTime(slot.end);
    const validation = validateCreate(employee, store.id, store.name, date, start, end, ctx);
    if (validation.valid) {
      return [{
        type: "create",
        storeId: store.id,
        storeName: store.name,
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        date,
        startTime: start,
        endTime: end,
        explanation: `Créneau alternatif : ${start}–${end}.`,
      }];
    }
  }

  return [];
}

function tryAlternativeEmployee(
  storeId: string,
  date: string,
  startTime: string,
  endTime: string,
  ctx: PlannerContext,
  excludeEmployeeId: string
): Alternative | null {
  for (const emp of ctx.employees) {
    if (emp.id === excludeEmployeeId) continue;
    if (!isAuthorizedStore(emp, storeId)) continue;

    const validation = validateCreate(emp, storeId, "", date, startTime, endTime, ctx);
    if (validation.valid) {
      const store = ctx.stores.find((s) => s.id === storeId);
      return {
        description: `${emp.firstName} ${emp.lastName} est disponible sur ce créneau`,
        actions: [{
          type: "create",
          storeId,
          storeName: store?.name || "",
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          date,
          startTime,
          endTime,
          explanation: `Alternative : ${emp.firstName} ${emp.lastName} au lieu.`,
        }],
      };
    }
  }

  return null;
}

function findAvailableEmployee(
  storeId: string,
  date: string,
  startTime: string,
  endTime: string,
  ctx: PlannerContext,
  excludeIds: string[]
): PlannerEmployee | null {
  for (const emp of ctx.employees) {
    if (excludeIds.includes(emp.id)) continue;
    if (!isAuthorizedStore(emp, storeId)) continue;

    const store = ctx.stores.find((s) => s.id === storeId);
    const validation = validateCreate(emp, storeId, store?.name || "", date, startTime, endTime, ctx);
    if (validation.valid) {
      return emp;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════
// ─── CONVERSATIONAL QUERIES ─────────────────────
// ═══════════════════════════════════════════════════

// ─── Query: Who's Available ─────────────────────

function queryAvailable(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { date, store, startTime, endTime } = cmd;

  if (!date) {
    return makeErrorProposal(cmd, ["Précisez un jour (ex: demain, vendredi, lundi)."]);
  }

  const targetStores = store
    ? [ctx.stores.find((s) => s.id === store.id)].filter(Boolean) as PlannerStore[]
    : ctx.stores;

  const available: AvailableEmployee[] = [];

  for (const emp of ctx.employees) {
    // Check if employee is authorized for any target store
    const authorizedStore = targetStores.find((s) => isAuthorizedStore(emp, s.id));
    if (!authorizedStore) continue;

    // Get schedule for the day
    const { schedule } = isStoreOpen(authorizedStore, date);
    const checkStart = startTime || schedule?.openTime || "08:00";
    const checkEnd = endTime || schedule?.closeTime || "20:00";

    const validation = validateCreate(
      emp, authorizedStore.id, authorizedStore.name, date, checkStart, checkEnd, ctx
    );

    if (validation.valid) {
      const weeklyH = getWeeklyHours(emp.id, ctx.weekStart, ctx.shifts);
      const contractH = emp.weeklyHours;
      const hoursInfo = contractH
        ? `${weeklyH.toFixed(0)}h/${contractH}h cette semaine`
        : `${weeklyH.toFixed(0)}h cette semaine`;

      available.push({
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        reason: `Disponible — ${hoursInfo}`,
      });
    }
  }

  const timeRange = startTime && endTime ? `${startTime}–${endTime}` : "la journée";
  const storeLabel = store ? ` au ${store.name}` : "";

  const queryResult: QueryResult = {
    type: "available",
    availableEmployees: available,
  };

  return {
    actions: [],
    warnings: [],
    alternatives: [],
    explanation: available.length > 0
      ? `${available.length} employé(s) disponible(s) le ${date}${storeLabel} pour ${timeRange}`
      : `Aucun employé disponible le ${date}${storeLabel} pour ${timeRange}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
    queryResult,
  };
}

// ─── Query: Find Replacement ────────────────────

function queryReplacement(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee, date } = cmd;

  if (!employee) {
    return makeErrorProposal(cmd, ["Précisez l'employé à remplacer (ex: remplaçant pour Zakaria vendredi)."]);
  }
  if (!date) {
    return makeErrorProposal(cmd, ["Précisez le jour (ex: vendredi, demain)."]);
  }

  // Find the employee's shift that day
  const normalizedDate = date.split("T")[0];
  const empShift = ctx.shifts.find(
    (s) => s.employeeId === employee.id && s.date.split("T")[0] === normalizedDate
  );

  const startTime = cmd.startTime || empShift?.startTime || "08:00";
  const endTime = cmd.endTime || empShift?.endTime || "20:00";
  const storeId = empShift?.storeId || cmd.store?.id;
  const storeName = empShift?.storeName || cmd.store?.name || "";

  if (!storeId) {
    return makeErrorProposal(cmd, [`Aucun shift trouvé pour ${employee.firstName} le ${date}, et aucun magasin spécifié.`]);
  }

  const available: AvailableEmployee[] = [];
  const actions: ProposalAction[] = [];

  for (const emp of ctx.employees) {
    if (emp.id === employee.id) continue;
    if (!isAuthorizedStore(emp, storeId)) continue;

    const validation = validateCreate(emp, storeId, storeName, date, startTime, endTime, ctx);

    if (validation.valid) {
      const weeklyH = getWeeklyHours(emp.id, ctx.weekStart, ctx.shifts);
      const contractH = emp.weeklyHours;
      const hoursInfo = contractH
        ? `${weeklyH.toFixed(0)}h/${contractH}h`
        : `${weeklyH.toFixed(0)}h`;

      available.push({
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        reason: `Disponible ${startTime}–${endTime} — ${hoursInfo} cette semaine`,
      });
    }
  }

  // Best replacement as proposal action
  if (available.length > 0 && empShift) {
    const best = available[0];
    actions.push({
      type: "update",
      shiftId: empShift.id,
      storeId,
      storeName,
      employeeId: best.id,
      employeeName: `${best.firstName} ${best.lastName}`,
      date,
      startTime,
      endTime,
      explanation: `Remplacer ${employee.firstName} par ${best.firstName} ${best.lastName} (${startTime}–${endTime}).`,
    });
  }

  return {
    actions,
    warnings: [],
    alternatives: [],
    explanation: available.length > 0
      ? `${available.length} remplaçant(s) trouvé(s) pour ${employee.firstName} le ${date} (${startTime}–${endTime})`
      : `Aucun remplaçant disponible pour ${employee.firstName} le ${date} (${startTime}–${endTime})`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
    queryResult: { type: "replacement", availableEmployees: available },
  };
}

// ─── Query: Who's Working ───────────────────────

function querySchedule(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { date, employee, store } = cmd;

  // If employee specified: show their schedule for the week
  if (employee) {
    const schedule: EmployeeScheduleEntry[] = [];
    let totalHours = 0;

    for (const s of ctx.shifts) {
      if (s.employeeId !== employee.id) continue;
      const hours = shiftHours(s.startTime, s.endTime);
      totalHours += hours;
      schedule.push({
        date: s.date.split("T")[0],
        startTime: s.startTime,
        endTime: s.endTime,
        storeName: s.storeName,
        hours,
      });
    }

    const emp = ctx.employees.find((e) => e.id === employee.id);
    const contractH = emp?.weeklyHours ?? null;

    return {
      actions: [],
      warnings: [],
      alternatives: [],
      explanation: schedule.length > 0
        ? `Planning de ${employee.firstName} cette semaine : ${schedule.length} shift(s), ${totalHours.toFixed(1)}h total${contractH ? ` (contrat ${contractH}h)` : ""}`
        : `${employee.firstName} n'a aucun shift cette semaine.`,
      parsedIntent: cmd as unknown as Proposal["parsedIntent"],
      resolvedCommand: cmd,
      queryResult: { type: "schedule", schedule, totalHours, contractHours: contractH },
    };
  }

  // If date specified: who's working that day
  if (date) {
    const normalizedDate = date.split("T")[0];
    const dayShifts = ctx.shifts.filter((s) => {
      const match = s.date.split("T")[0] === normalizedDate;
      if (store) return match && s.storeId === store.id;
      return match;
    });

    const schedule: EmployeeScheduleEntry[] = dayShifts.map((s) => ({
      date: s.date.split("T")[0],
      startTime: s.startTime,
      endTime: s.endTime,
      storeName: s.storeName,
      hours: shiftHours(s.startTime, s.endTime),
    }));

    const storeLabel = store ? ` au ${store.name}` : "";

    return {
      actions: [],
      warnings: [],
      alternatives: [],
      explanation: dayShifts.length > 0
        ? `${dayShifts.length} personne(s) travaille(nt) le ${date}${storeLabel}`
        : `Personne ne travaille le ${date}${storeLabel}`,
      parsedIntent: cmd as unknown as Proposal["parsedIntent"],
      resolvedCommand: cmd,
      queryResult: { type: "schedule", schedule },
    };
  }

  return makeErrorProposal(cmd, ["Précisez un employé ou un jour."]);
}

// ─── Query: Employee Hours ──────────────────────

function queryHours(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const { employee } = cmd;

  if (!employee) {
    // Show hours for all employees
    const entries: { name: string; hours: number; contract: number | null }[] = [];

    for (const emp of ctx.employees) {
      const h = getWeeklyHours(emp.id, ctx.weekStart, ctx.shifts);
      if (h > 0 || emp.weeklyHours) {
        entries.push({ name: `${emp.firstName} ${emp.lastName}`, hours: h, contract: emp.weeklyHours });
      }
    }

    entries.sort((a, b) => b.hours - a.hours);

    const lines = entries.map((e) => {
      const contractStr = e.contract ? `/${e.contract}h` : "";
      const overFlag = e.contract && e.hours > e.contract ? " ⚠️" : "";
      return `${e.name} : ${e.hours.toFixed(1)}h${contractStr}${overFlag}`;
    });

    return {
      actions: [],
      warnings: [],
      alternatives: [],
      explanation: lines.length > 0
        ? `Heures cette semaine :\n${lines.join("\n")}`
        : "Aucune heure enregistrée cette semaine.",
      parsedIntent: cmd as unknown as Proposal["parsedIntent"],
      resolvedCommand: cmd,
      queryResult: { type: "hours" },
    };
  }

  // Single employee
  const h = getWeeklyHours(employee.id, ctx.weekStart, ctx.shifts);
  const emp = ctx.employees.find((e) => e.id === employee.id);
  const contractH = emp?.weeklyHours ?? null;
  const warnings: string[] = [];

  if (contractH && h > contractH) {
    warnings.push(`${employee.firstName} dépasse son contrat : ${h.toFixed(1)}h / ${contractH}h.`);
  }

  return {
    actions: [],
    warnings,
    alternatives: [],
    explanation: contractH
      ? `${employee.firstName} ${employee.lastName} : ${h.toFixed(1)}h / ${contractH}h cette semaine`
      : `${employee.firstName} ${employee.lastName} : ${h.toFixed(1)}h cette semaine`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
    queryResult: { type: "hours", totalHours: h, contractHours: contractH },
  };
}

// ─── Query: Analyze Planning ────────────────────

function queryAnalyze(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const issues: PlanningIssue[] = [];

  // Get all dates in the week
  const ws = parseDate(ctx.weekStart);
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws);
    d.setUTCDate(ws.getUTCDate() + i);
    weekDates.push(d.toISOString().split("T")[0]);
  }

  // 1. Coverage gaps
  for (const store of ctx.stores) {
    for (const dateStr of weekDates) {
      const { open, schedule } = isStoreOpen(store, dateStr);
      if (!open) continue;

      const minEmp = schedule?.minEmployees ?? store.minEmployees;
      const dayShifts = ctx.shifts.filter(
        (s) => s.storeId === store.id && s.date.split("T")[0] === dateStr
      );

      if (dayShifts.length < minEmp) {
        issues.push({
          severity: "critical",
          category: "coverage",
          message: `${store.name} non couvert le ${dateStr} : ${dayShifts.length}/${minEmp} employé(s)`,
          date: dateStr,
          storeName: store.name,
        });
      }
    }
  }

  // 2. Unassigned shifts
  const unassigned = ctx.shifts.filter((s) => !s.employeeId);
  for (const s of unassigned) {
    issues.push({
      severity: "warning",
      category: "unassigned",
      message: `Shift non assigné : ${s.storeName} le ${s.date.split("T")[0]} (${s.startTime}–${s.endTime})`,
      date: s.date.split("T")[0],
      storeName: s.storeName,
    });
  }

  // 3. Overtime + breaks + rest per employee
  for (const emp of ctx.employees) {
    const weeklyH = getWeeklyHours(emp.id, ctx.weekStart, ctx.shifts);

    // Weekly hours exceeded
    if (emp.weeklyHours && weeklyH > emp.weeklyHours) {
      issues.push({
        severity: "warning",
        category: "overtime",
        message: `${emp.firstName} ${emp.lastName} dépasse son contrat : ${weeklyH.toFixed(1)}h / ${emp.weeklyHours}h`,
        employeeName: `${emp.firstName} ${emp.lastName}`,
      });
    }
    if (weeklyH > emp.maxHoursPerWeek) {
      issues.push({
        severity: "critical",
        category: "overtime",
        message: `${emp.firstName} ${emp.lastName} dépasse le max légal : ${weeklyH.toFixed(1)}h / ${emp.maxHoursPerWeek}h`,
        employeeName: `${emp.firstName} ${emp.lastName}`,
      });
    }

    // Check each day
    for (const dateStr of weekDates) {
      const dailyH = getDailyHours(emp.id, dateStr, ctx.shifts);
      if (dailyH === 0) continue;

      // Daily max exceeded
      if (dailyH > emp.maxHoursPerDay) {
        issues.push({
          severity: "critical",
          category: "overtime",
          message: `${emp.firstName} dépasse ${emp.maxHoursPerDay}h/jour le ${dateStr} : ${dailyH.toFixed(1)}h`,
          date: dateStr,
          employeeName: `${emp.firstName} ${emp.lastName}`,
        });
      }

      // Missing break (>6h without break)
      const dayShifts = ctx.shifts.filter(
        (s) => s.employeeId === emp.id && s.date.split("T")[0] === dateStr
      );
      if (dayShifts.length === 1 && dailyH > 6) {
        issues.push({
          severity: "warning",
          category: "break",
          message: `${emp.firstName} travaille ${dailyH.toFixed(1)}h sans pause le ${dateStr}`,
          date: dateStr,
          employeeName: `${emp.firstName} ${emp.lastName}`,
        });
      }
    }

    // Rest between days
    const empShifts = ctx.shifts
      .filter((s) => s.employeeId === emp.id)
      .sort((a, b) => {
        const da = a.date.split("T")[0];
        const db = b.date.split("T")[0];
        if (da !== db) return da.localeCompare(db);
        return a.startTime.localeCompare(b.startTime);
      });

    for (let i = 1; i < empShifts.length; i++) {
      const prev = empShifts[i - 1];
      const curr = empShifts[i];
      const prevEnd = parseDate(prev.date.split("T")[0]).getTime() + timeToMin(prev.endTime) * 60000;
      const currStart = parseDate(curr.date.split("T")[0]).getTime() + timeToMin(curr.startTime) * 60000;
      const gapH = (currStart - prevEnd) / 3600000;

      if (gapH >= 0 && gapH < emp.minRestBetween) {
        issues.push({
          severity: "critical",
          category: "rest",
          message: `${emp.firstName} : seulement ${gapH.toFixed(1)}h de repos entre ${prev.date.split("T")[0]} (fin ${prev.endTime}) et ${curr.date.split("T")[0]} (début ${curr.startTime}). Min : ${emp.minRestBetween}h`,
          employeeName: `${emp.firstName} ${emp.lastName}`,
        });
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return {
    actions: [],
    warnings: [],
    alternatives: [],
    explanation: issues.length > 0
      ? `${issues.length} problème(s) détecté(s) : ${criticalCount} critique(s), ${warningCount} avertissement(s)`
      : "Aucun problème détecté. Le planning est conforme.",
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
    queryResult: { type: "analysis", issues },
  };
}

// ─── Query: Planning Score ──────────────────────

function queryScore(
  cmd: ResolvedCommand,
  ctx: PlannerContext
): Proposal {
  const ws = parseDate(ctx.weekStart);
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws);
    d.setUTCDate(ws.getUTCDate() + i);
    weekDates.push(d.toISOString().split("T")[0]);
  }

  // 1. Coverage score (0-100)
  let coveredDays = 0;
  let totalOpenDays = 0;
  for (const store of ctx.stores) {
    for (const dateStr of weekDates) {
      const { open, schedule } = isStoreOpen(store, dateStr);
      if (!open) continue;
      totalOpenDays++;
      const minEmp = schedule?.minEmployees ?? store.minEmployees;
      const dayShifts = ctx.shifts.filter(
        (s) => s.storeId === store.id && s.date.split("T")[0] === dateStr
      );
      if (dayShifts.length >= minEmp) coveredDays++;
    }
  }
  const coverageScore = totalOpenDays > 0 ? Math.round((coveredDays / totalOpenDays) * 100) : 100;

  // 2. Hours balance score (0-100)
  let balanceTotal = 0;
  let balanceCount = 0;
  for (const emp of ctx.employees) {
    if (!emp.weeklyHours) continue;
    const h = getWeeklyHours(emp.id, ctx.weekStart, ctx.shifts);
    if (h === 0 && emp.weeklyHours === 0) continue;
    const ratio = emp.weeklyHours > 0 ? Math.min(h / emp.weeklyHours, 1.5) : 1;
    const deviation = Math.abs(1 - ratio);
    balanceTotal += Math.max(0, 100 - deviation * 100);
    balanceCount++;
  }
  const hoursBalanceScore = balanceCount > 0 ? Math.round(balanceTotal / balanceCount) : 100;

  // 3. Breaks score (0-100)
  let breaksOk = 0;
  let breaksTotal = 0;
  for (const emp of ctx.employees) {
    for (const dateStr of weekDates) {
      const dailyH = getDailyHours(emp.id, dateStr, ctx.shifts);
      if (dailyH <= 0) continue;
      if (dailyH > 6) {
        breaksTotal++;
        const dayShifts = ctx.shifts.filter(
          (s) => s.employeeId === emp.id && s.date.split("T")[0] === dateStr
        );
        if (dayShifts.length >= 2) breaksOk++; // Has a break (2+ shifts = split)
      }
    }
  }
  const breaksScore = breaksTotal > 0 ? Math.round((breaksOk / breaksTotal) * 100) : 100;

  // 4. Rest score (0-100)
  let restOk = 0;
  let restTotal = 0;
  for (const emp of ctx.employees) {
    const empShifts = ctx.shifts
      .filter((s) => s.employeeId === emp.id)
      .sort((a, b) => {
        const da = a.date.split("T")[0];
        const db = b.date.split("T")[0];
        return da !== db ? da.localeCompare(db) : a.startTime.localeCompare(b.startTime);
      });
    for (let i = 1; i < empShifts.length; i++) {
      restTotal++;
      const prev = empShifts[i - 1];
      const curr = empShifts[i];
      const prevEnd = parseDate(prev.date.split("T")[0]).getTime() + timeToMin(prev.endTime) * 60000;
      const currStart = parseDate(curr.date.split("T")[0]).getTime() + timeToMin(curr.startTime) * 60000;
      const gapH = (currStart - prevEnd) / 3600000;
      if (gapH >= emp.minRestBetween) restOk++;
    }
  }
  const restScore = restTotal > 0 ? Math.round((restOk / restTotal) * 100) : 100;

  // 5. Unassigned penalty (0-100)
  const totalShifts = ctx.shifts.length;
  const unassigned = ctx.shifts.filter((s) => !s.employeeId).length;
  const unassignedScore = totalShifts > 0 ? Math.round(((totalShifts - unassigned) / totalShifts) * 100) : 100;

  // Total weighted score
  const total = Math.round(
    coverageScore * 0.35 +
    hoursBalanceScore * 0.20 +
    breaksScore * 0.15 +
    restScore * 0.20 +
    unassignedScore * 0.10
  );

  const label = total >= 85 ? "Excellent" : total >= 70 ? "Bon" : total >= 50 ? "Acceptable" : "Insuffisant";

  const score: PlanningScore = {
    total,
    label,
    breakdown: {
      coverage: coverageScore,
      hoursBalance: hoursBalanceScore,
      breaksRespected: breaksScore,
      restRespected: restScore,
      unassignedPenalty: unassignedScore,
    },
  };

  return {
    actions: [],
    warnings: [],
    alternatives: [],
    explanation: `Score planning : ${total}/100 — ${label}`,
    parsedIntent: cmd as unknown as Proposal["parsedIntent"],
    resolvedCommand: cmd,
    queryResult: { type: "score", score },
  };
}

// ─── Main Plan Function ─────────────────────────

export function planCommand(
  cmd: ResolvedCommand,
  ctx: PlannerContext,
  parsedIntent: import("./types").ParsedIntent
): Proposal {
  // If resolution had errors, return them
  if (cmd.errors.length > 0) {
    const proposal = makeErrorProposal(cmd, cmd.errors);
    proposal.parsedIntent = parsedIntent;
    return proposal;
  }

  let proposal: Proposal;

  switch (cmd.action) {
    case "CREATE":
      proposal = planCreate(cmd, ctx);
      break;
    case "MOVE":
      proposal = planMove(cmd, ctx);
      break;
    case "DELETE":
      proposal = planDelete(cmd, ctx);
      break;
    case "SHORTEN":
      proposal = planShorten(cmd, ctx);
      break;
    case "EXTEND":
      proposal = planExtend(cmd, ctx);
      break;
    case "ADD_BREAK":
      proposal = planAddBreak(cmd, ctx);
      break;
    case "FILL_GAPS":
      proposal = planFillGaps(cmd, ctx);
      break;
    case "OPTIMIZE_DAY":
    case "OPTIMIZE_WEEK":
      proposal = planOptimize(cmd, ctx);
      break;
    // ─── Conversational queries ───
    case "QUERY_AVAILABLE":
      proposal = queryAvailable(cmd, ctx);
      break;
    case "FIND_REPLACEMENT":
      proposal = queryReplacement(cmd, ctx);
      break;
    case "QUERY_SCHEDULE":
      proposal = querySchedule(cmd, ctx);
      break;
    case "QUERY_HOURS":
      proposal = queryHours(cmd, ctx);
      break;
    case "ANALYZE":
      proposal = queryAnalyze(cmd, ctx);
      break;
    case "QUERY_SCORE":
      proposal = queryScore(cmd, ctx);
      break;
    default:
      proposal = makeErrorProposal(cmd, ["Action non reconnue."]);
  }

  // Always set parsedIntent
  proposal.parsedIntent = parsedIntent;
  return proposal;
}
