import { prisma } from "@/lib/prisma";

/**
 * Score de fiabilité employé (0-100)
 *
 * Barème enrichi (Manager Brain) :
 *  1. Ponctualité        — 20 pts (base 20, -1/-2/-3 par retard selon gravité)
 *  2. Présence            — 20 pts (base 20, -6 no-show, -4 absence injustifiée, -0.5 approuvée)
 *  3. Autonomie           — 15 pts (compétences + historique shifts solo ouverture/fermeture)
 *  4. Qualité ouv/ferm    — 10 pts (ponctualité sur shifts ouverture/fermeture)
 *  5. Incidents           — 10 pts (pénalité par ManagerAlert liée)
 *  6. Remplacement        — 10 pts (ratio acceptations/(acceptations+refus), neutre si aucune offre)
 *  7. Planning            — 10 pts (base 10, -1 par échange/listing initié)
 *  8. Transparence        — 5 pts  (ratio absences déclarées / total)
 *
 * Profils :
 *  A (>= 75) : Très fiable, autonome, peut ouvrir seul, magasins difficiles
 *  B (50-74) : Correct, fiable moyen
 *  C (< 50)  : Fragile, ne doit pas être seul sur créneau sensible
 *
 * Période : 30 derniers jours (rolling window)
 */

export type ProfileCategory = "A" | "B" | "C";

export interface ScoreBreakdown {
  score: number;
  punctualityScore: number;      // /20
  attendanceScore: number;       // /20
  autonomyScore: number;         // /15
  openCloseQualityScore: number; // /10
  incidentScore: number;         // /10
  replacementScore: number;      // /10
  planningScore: number;         // /10
  transparencyScore: number;     // /5
  profileCategory: ProfileCategory;
  metrics: ScoreMetrics;
}

export interface ScoreMetrics {
  // Ponctualité
  totalShiftsWithClockIn: number;
  onTimeCount: number;
  lateCount: number;
  latePenalty: number;

  // Présence
  totalAssignedShifts: number;
  noShowCount: number;
  unjustifiedAbsences: number;
  approvedAbsences: number;

  // Autonomie
  skillCount: number;
  hasOpenCloseSkills: boolean;
  openCloseShifts: number;

  // Qualité ouv/ferm
  openCloseShiftsTotal: number;
  openCloseOnTimeCount: number;

  // Incidents
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;

  // Remplacement
  replacementOffersReceived: number;
  replacementsAccepted: number;
  replacementsDeclined: number;

  // Planning
  exchangesInitiated: number;
  listingsPosted: number;

  // Transparence
  totalAbsences: number;
  declaredAbsences: number;
}

/**
 * Derive profile category from total score.
 */
export function deriveProfileCategory(score: number): ProfileCategory {
  if (score >= 75) return "A";
  if (score >= 50) return "B";
  return "C";
}

export async function calculateReliabilityScore(
  employeeId: string,
  periodDays: number = 30
): Promise<ScoreBreakdown> {
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - periodDays);

  // Fetch all data in parallel
  const [clockIns, shifts, absences, replacementCandidates, exchanges, listings, employee, managerAlerts] =
    await Promise.all([
      // 1. ClockIn records
      prisma.clockIn.findMany({
        where: {
          employeeId,
          clockInAt: { gte: periodStart },
        },
        select: {
          status: true,
          lateMinutes: true,
          shiftId: true,
        },
      }),

      // 2. All assigned shifts in period (with store schedule info for open/close detection)
      prisma.shift.findMany({
        where: {
          employeeId,
          date: { gte: periodStart, lte: now },
        },
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
          storeId: true,
          store: {
            select: {
              schedules: {
                select: { dayOfWeek: true, openTime: true, closeTime: true },
              },
            },
          },
        },
      }),

      // 3. Absence declarations
      prisma.absenceDeclaration.findMany({
        where: {
          employeeId,
          createdAt: { gte: periodStart },
        },
        select: {
          status: true,
          type: true,
          startDate: true,
          endDate: true,
        },
      }),

      // 4. Replacement candidates (offers received)
      prisma.replacementCandidate.findMany({
        where: {
          employeeId,
          createdAt: { gte: periodStart },
        },
        select: {
          status: true,
        },
      }),

      // 5. Shift exchanges initiated
      prisma.shiftExchange.findMany({
        where: {
          requesterId: employeeId,
          createdAt: { gte: periodStart },
        },
        select: {
          id: true,
        },
      }),

      // 6. Market listings posted
      prisma.shiftMarketListing.findMany({
        where: {
          posterId: employeeId,
          createdAt: { gte: periodStart },
        },
        select: {
          id: true,
        },
      }),

      // 7. Employee skills
      prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          skills: true,
        },
      }),

      // 8. Manager alerts related to employee (via contextKey containing employeeId)
      prisma.managerAlert.findMany({
        where: {
          createdAt: { gte: periodStart },
          contextKey: { contains: employeeId },
        },
        select: {
          severity: true,
        },
      }),
    ]);

  // ─── 1. Ponctualité (20 pts) ─────────────────
  const onTimeCount = clockIns.filter((c) => c.status === "ON_TIME").length;
  const lateClockIns = clockIns.filter((c) => c.status === "LATE");
  const lateCount = lateClockIns.length;

  let latePenalty = 0;
  for (const c of lateClockIns) {
    const minutes = c.lateMinutes || 0;
    if (minutes <= 10) latePenalty += 1;
    else if (minutes <= 30) latePenalty += 2;
    else latePenalty += 3;
  }

  const punctualityScore = Math.max(0, 20 - latePenalty);

  // ─── 2. Présence (20 pts) ────────────────────
  // Shifts in the past that had no clock-in = no-show
  const clockedShiftIds = new Set(clockIns.filter((c) => c.shiftId).map((c) => c.shiftId));
  const pastShifts = shifts.filter((s) => new Date(s.date) < now);
  const noShowShifts = pastShifts.filter((s) => !clockedShiftIds.has(s.id));
  // Exclude shifts covered by approved absences to avoid double-counting
  const approvedAbsencesList = absences.filter((a) => a.status === "APPROVED");
  const noShowCount = noShowShifts.filter((s) => {
    const shiftDate = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
    return !approvedAbsencesList.some((a) => {
      const absStart = a.startDate instanceof Date ? a.startDate.toISOString().slice(0, 10) : String(a.startDate).slice(0, 10);
      const absEnd = a.endDate instanceof Date ? a.endDate.toISOString().slice(0, 10) : String(a.endDate).slice(0, 10);
      return shiftDate >= absStart && shiftDate <= absEnd;
    });
  }).length;

  // Absence types
  const unjustifiedAbsences = absences.filter(
    (a) => a.status === "REJECTED"
  ).length;
  const approvedAbsences = absences.filter(
    (a) => a.status === "APPROVED"
  ).length;

  const attendancePenalty =
    noShowCount * 6 + unjustifiedAbsences * 4 + approvedAbsences * 0.5;
  const attendanceScore = Math.max(0, Math.round(20 - attendancePenalty));

  // ─── 3. Autonomie (15 pts) ───────────────────
  const skills = (employee?.skills as string[]) || [];
  const skillCount = skills.length;
  const hasOpenCloseSkills =
    skills.includes("OUVERTURE") ||
    skills.includes("FERMETURE") ||
    skills.includes("MANAGER");

  // Skill score: min(7, skillCount * 1.5), bonus for open/close/manager skills
  let skillScore = Math.min(7, skillCount * 1.5);
  if (hasOpenCloseSkills) skillScore = Math.min(7, skillScore + 1);

  // Open/close shifts: count shifts during the first/last 30min of the store's opening hours
  let openCloseShifts = 0;
  for (const shift of pastShifts) {
    const dow = new Date(shift.date).getUTCDay();
    const schedule = shift.store?.schedules?.find(
      (s: { dayOfWeek: number }) => s.dayOfWeek === dow
    );
    if (!schedule || !schedule.openTime || !schedule.closeTime) continue;

    const shiftStartMin = timeToMinutes(shift.startTime);
    const shiftEndMin = timeToMinutes(shift.endTime);
    const openMin = timeToMinutes(schedule.openTime);
    const closeMin = timeToMinutes(schedule.closeTime);

    const isOpenShift = shiftStartMin <= openMin + 30;
    const isCloseShift = shiftEndMin >= closeMin - 30;

    if (isOpenShift || isCloseShift) openCloseShifts++;
  }
  // Normalize open/close score: up to 8 pts for up to 8 open/close shifts
  const openCloseScore = Math.min(8, openCloseShifts);

  const autonomyScore = Math.min(15, Math.round(skillScore + openCloseScore));

  // ─── 4. Qualité ouverture/fermeture (10 pts) ──
  // Identify open/close shifts and check punctuality on them
  let openCloseShiftsTotal = 0;
  let openCloseOnTimeCount = 0;

  for (const shift of pastShifts) {
    const dow = new Date(shift.date).getUTCDay();
    const schedule = shift.store?.schedules?.find(
      (s: { dayOfWeek: number }) => s.dayOfWeek === dow
    );
    if (!schedule || !schedule.openTime || !schedule.closeTime) continue;

    const shiftStartMin = timeToMinutes(shift.startTime);
    const shiftEndMin = timeToMinutes(shift.endTime);
    const openMin = timeToMinutes(schedule.openTime);
    const closeMin = timeToMinutes(schedule.closeTime);

    const isOpenShift = shiftStartMin <= openMin + 30;
    const isCloseShift = shiftEndMin >= closeMin - 30;

    if (isOpenShift || isCloseShift) {
      openCloseShiftsTotal++;
      // Check if this shift had an on-time clock-in
      const clockIn = clockIns.find((c) => c.shiftId === shift.id);
      if (clockIn && clockIn.status === "ON_TIME") {
        openCloseOnTimeCount++;
      }
    }
  }

  let openCloseQualityScore: number;
  if (openCloseShiftsTotal === 0) {
    openCloseQualityScore = 5; // Neutral — no open/close shifts
  } else {
    openCloseQualityScore = Math.round(
      (openCloseOnTimeCount / openCloseShiftsTotal) * 10
    );
  }

  // ─── 5. Incidents (10 pts) ───────────────────
  const criticalAlerts = managerAlerts.filter(
    (a) => a.severity === "CRITICAL"
  ).length;
  const warningAlerts = managerAlerts.filter(
    (a) => a.severity === "WARNING"
  ).length;
  const infoAlerts = managerAlerts.filter(
    (a) => a.severity === "INFO"
  ).length;

  const incidentPenalty =
    criticalAlerts * 3 + warningAlerts * 2 + infoAlerts * 1;
  const incidentScore = Math.max(0, 10 - incidentPenalty);

  // ─── 6. Remplacements (10 pts) ───────────────
  const accepted = replacementCandidates.filter(
    (r) => r.status === "ACCEPTED"
  ).length;
  const declined = replacementCandidates.filter(
    (r) => r.status === "DECLINED"
  ).length;

  let replacementScore: number;
  if (accepted + declined === 0) {
    replacementScore = 10; // Neutre — aucune offre
  } else {
    replacementScore = Math.round((accepted / (accepted + declined)) * 10);
  }

  // ─── 7. Planning (10 pts) ────────────────────
  const exchangesInitiated = exchanges.length;
  const listingsPosted = listings.length;
  const planningPenalty = exchangesInitiated + listingsPosted;
  const planningScore = Math.max(0, 10 - planningPenalty);

  // ─── 8. Transparence (5 pts) ─────────────────
  // Total absences = no-shows + all declared absences (excluding rejected)
  const declaredAbsences = absences.filter(a => a.status !== "REJECTED").length;
  const totalAbsences = noShowCount + declaredAbsences;

  let transparencyScore: number;
  if (totalAbsences === 0) {
    transparencyScore = 5; // Perfect — no absences at all
  } else {
    transparencyScore = Math.round((declaredAbsences / totalAbsences) * 5);
  }

  // ─── Total ───────────────────────────────────
  const score = Math.min(
    100,
    Math.max(
      0,
      punctualityScore +
        attendanceScore +
        autonomyScore +
        openCloseQualityScore +
        incidentScore +
        replacementScore +
        planningScore +
        transparencyScore
    )
  );

  const profileCategory = deriveProfileCategory(score);

  return {
    score,
    punctualityScore,
    attendanceScore,
    autonomyScore,
    openCloseQualityScore,
    incidentScore,
    replacementScore,
    planningScore,
    transparencyScore,
    profileCategory,
    metrics: {
      totalShiftsWithClockIn: clockIns.length,
      onTimeCount,
      lateCount,
      latePenalty,
      totalAssignedShifts: shifts.length,
      noShowCount,
      unjustifiedAbsences,
      approvedAbsences,
      skillCount,
      hasOpenCloseSkills,
      openCloseShifts,
      openCloseShiftsTotal,
      openCloseOnTimeCount,
      criticalAlerts,
      warningAlerts,
      infoAlerts,
      replacementOffersReceived: replacementCandidates.length,
      replacementsAccepted: accepted,
      replacementsDeclined: declined,
      exchangesInitiated,
      listingsPosted,
      totalAbsences,
      declaredAbsences,
    },
  };
}

/**
 * Recalculate and persist the score for an employee.
 * Updates Employee.reliabilityScore + profileCategory + creates a history entry.
 */
export async function recalculateAndSave(employeeId: string): Promise<ScoreBreakdown> {
  const breakdown = await calculateReliabilityScore(employeeId);
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - 30);

  await prisma.$transaction([
    // Update employee
    prisma.employee.update({
      where: { id: employeeId },
      data: {
        reliabilityScore: breakdown.score,
        profileCategory: breakdown.profileCategory,
        scoreUpdatedAt: now,
      },
    }),

    // Upsert history (one entry per employee per periodStart day)
    prisma.reliabilityScoreHistory.upsert({
      where: {
        employeeId_periodStart: {
          employeeId,
          periodStart: new Date(periodStart.toISOString().split("T")[0] + "T00:00:00Z"),
        },
      },
      create: {
        employeeId,
        score: breakdown.score,
        punctualityScore: breakdown.punctualityScore,
        attendanceScore: breakdown.attendanceScore,
        replacementScore: breakdown.replacementScore,
        planningScore: breakdown.planningScore,
        transparencyScore: breakdown.transparencyScore,
        periodStart: new Date(periodStart.toISOString().split("T")[0] + "T00:00:00Z"),
        periodEnd: now,
        metrics: JSON.stringify({
          ...breakdown.metrics,
          autonomyScore: breakdown.autonomyScore,
          openCloseQualityScore: breakdown.openCloseQualityScore,
          incidentScore: breakdown.incidentScore,
        }),
      },
      update: {
        score: breakdown.score,
        punctualityScore: breakdown.punctualityScore,
        attendanceScore: breakdown.attendanceScore,
        replacementScore: breakdown.replacementScore,
        planningScore: breakdown.planningScore,
        transparencyScore: breakdown.transparencyScore,
        periodEnd: now,
        metrics: JSON.stringify({
          ...breakdown.metrics,
          autonomyScore: breakdown.autonomyScore,
          openCloseQualityScore: breakdown.openCloseQualityScore,
          incidentScore: breakdown.incidentScore,
        }),
      },
    }),
  ]);

  return breakdown;
}

// ─── Helper ─────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
