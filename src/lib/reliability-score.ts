import { prisma } from "@/lib/prisma";

/**
 * Score de fiabilité employé (0-100)
 *
 * Barème :
 *  1. Ponctualité  — 30 pts (base 30, -1/-2/-3 par retard selon gravité)
 *  2. Présence     — 30 pts (base 30, -6 no-show, -4 absence injustifiée, -0.5 approuvée)
 *  3. Remplacement — 20 pts (ratio acceptations/(acceptations+refus), neutre si aucune offre)
 *  4. Planning     — 15 pts (base 15, -1 par échange/listing initié)
 *  5. Transparence — 5 pts  (ratio absences déclarées / total)
 *
 * Période : 30 derniers jours (rolling window)
 */

export interface ScoreBreakdown {
  score: number;
  punctualityScore: number;   // /30
  attendanceScore: number;    // /30
  replacementScore: number;   // /20
  planningScore: number;      // /15
  transparencyScore: number;  // /5
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

export async function calculateReliabilityScore(
  employeeId: string,
  periodDays: number = 30
): Promise<ScoreBreakdown> {
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - periodDays);

  // Fetch all data in parallel
  const [clockIns, shifts, absences, replacementCandidates, exchanges, listings] =
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

      // 2. All assigned shifts in period
      prisma.shift.findMany({
        where: {
          employeeId,
          date: { gte: periodStart, lte: now },
        },
        select: {
          id: true,
          date: true,
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
    ]);

  // ─── 1. Ponctualité (30 pts) ─────────────────
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

  const punctualityScore = Math.max(0, 30 - latePenalty);

  // ─── 2. Présence (30 pts) ────────────────────
  // Shifts in the past that had no clock-in = no-show
  const clockedShiftIds = new Set(clockIns.filter((c) => c.shiftId).map((c) => c.shiftId));
  const pastShifts = shifts.filter((s) => new Date(s.date) < now);
  const noShowCount = pastShifts.filter((s) => !clockedShiftIds.has(s.id)).length;

  // Absence types
  const unjustifiedAbsences = absences.filter(
    (a) => a.status === "REJECTED"
  ).length;
  const approvedAbsences = absences.filter(
    (a) => a.status === "APPROVED"
  ).length;

  const attendancePenalty =
    noShowCount * 6 + unjustifiedAbsences * 4 + approvedAbsences * 0.5;
  const attendanceScore = Math.max(0, Math.round(30 - attendancePenalty));

  // ─── 3. Remplacements (20 pts) ───────────────
  const accepted = replacementCandidates.filter(
    (r) => r.status === "ACCEPTED"
  ).length;
  const declined = replacementCandidates.filter(
    (r) => r.status === "DECLINED"
  ).length;

  let replacementScore: number;
  if (accepted + declined === 0) {
    replacementScore = 20; // Neutre — aucune offre
  } else {
    replacementScore = Math.round((accepted / (accepted + declined)) * 20);
  }

  // ─── 4. Planning (15 pts) ────────────────────
  const exchangesInitiated = exchanges.length;
  const listingsPosted = listings.length;
  const planningPenalty = exchangesInitiated + listingsPosted;
  const planningScore = Math.max(0, 15 - planningPenalty);

  // ─── 5. Transparence (5 pts) ─────────────────
  // Total absences = no-shows + all declared absences
  const totalAbsences = noShowCount + absences.length;
  const declaredAbsences = absences.length;

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
        replacementScore +
        planningScore +
        transparencyScore
    )
  );

  return {
    score,
    punctualityScore,
    attendanceScore,
    replacementScore,
    planningScore,
    transparencyScore,
    metrics: {
      totalShiftsWithClockIn: clockIns.length,
      onTimeCount,
      lateCount,
      latePenalty,
      totalAssignedShifts: shifts.length,
      noShowCount,
      unjustifiedAbsences,
      approvedAbsences,
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
 * Updates Employee.reliabilityScore + creates a history entry.
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
        metrics: JSON.stringify(breakdown.metrics),
      },
      update: {
        score: breakdown.score,
        punctualityScore: breakdown.punctualityScore,
        attendanceScore: breakdown.attendanceScore,
        replacementScore: breakdown.replacementScore,
        planningScore: breakdown.planningScore,
        transparencyScore: breakdown.transparencyScore,
        periodEnd: now,
        metrics: JSON.stringify(breakdown.metrics),
      },
    }),
  ]);

  return breakdown;
}
