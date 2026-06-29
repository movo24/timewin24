/**
 * Décision d'accès caisse (POS) — logique PURE de référence.
 *
 * ARCHITECTURE : TimeWin24 définit le planning et les droits THÉORIQUES ;
 * POS Caisse exécute l'accès RÉEL et conserve une copie locale. TimeWin24 ne
 * doit JAMAIS être une dépendance bloquante temps réel pour l'ouverture de
 * caisse — la continuité magasin prime. En cas d'écart planning/présence, on
 * n'empêche pas l'encaissement si l'employé est actif et autorisé, mais on
 * remonte une alerte d'exception au siège.
 *
 * Règle des 5 points (dans l'ordre) :
 *   1. l'employé existe-t-il ?
 *   2. est-il actif (non radié / non désactivé) ?
 *   3. a-t-il le droit caisse ?
 *   4. est-il affecté à ce magasin ?
 *   5. est-il prévu au planning à cette heure ?
 *
 * Si 1→4 valides mais 5 faux : accès ACCORDÉ + exception « hors planning »
 * (urgent). Si l'un des points 1→4 est faux : accès REFUSÉ (critique). Tout est
 * historisé ; rien ici ne touche à un montant.
 */

export interface PosAccessInput {
  exists: boolean;
  active: boolean;
  cashierAuthorized: boolean;
  assignedToStore: boolean;
  scheduledNow: boolean;
}

export type PosAccessStatus = "OK" | "UNSCHEDULED" | "FORBIDDEN";
export type PosAccessDecision = "granted" | "denied";
/** Niveau d'alerte : aucune (nominal), urgent (hors planning), critique (refus). */
export type PosAccessAlertLevel = "none" | "urgent" | "critical";

export interface PosAccessResult {
  status: PosAccessStatus;
  decision: PosAccessDecision;
  alertLevel: PosAccessAlertLevel;
  /** Code motif machine (jamais de donnée sensible). */
  reason: string;
  /** Vrai si l'événement doit être revu par le siège. */
  requiresReview: boolean;
}

/**
 * Évalue une tentative d'accès caisse. Pure : aucune I/O, aucune valorisation.
 * L'ordre des contrôles 1→4 détermine le motif de refus le plus précis.
 */
export function evaluatePosAccess(input: PosAccessInput): PosAccessResult {
  // ── Points 1→4 : conditions de refus (accès bloqué) ──
  if (!input.exists) {
    return forbidden("unknown_code");
  }
  if (!input.active) {
    return forbidden("inactive");
  }
  if (!input.cashierAuthorized) {
    return forbidden("not_cashier_authorized");
  }
  if (!input.assignedToStore) {
    return forbidden("wrong_store");
  }

  // ── Point 5 : prévu au planning ? ──
  if (!input.scheduledNow) {
    return {
      status: "UNSCHEDULED",
      decision: "granted",
      alertLevel: "urgent",
      reason: "employee_active_and_cashier_authorized",
      requiresReview: true,
    };
  }

  return {
    status: "OK",
    decision: "granted",
    alertLevel: "none",
    reason: "scheduled",
    requiresReview: false,
  };
}

function forbidden(reason: string): PosAccessResult {
  return { status: "FORBIDDEN", decision: "denied", alertLevel: "critical", reason, requiresReview: true };
}
