/**
 * Socle DSN (Étage 5) — SQUELETTE UNIQUEMENT.
 *
 * ⚠️ Ce module ne réalise AUCUN dépôt réel, AUCUN appel réseau vers Urssaf /
 * Agirc-Arrco / net-entreprises. Le dépôt réel est **Tier-3 (jamais l'agent)**.
 * Tout dépassement du squelette d'entités/états est **Tier-2** (GO requis).
 *
 * On fournit ici : le type d'entité `DSNDeclaration`, la machine à états, et le
 * **feature flag obligatoire `dsn_submission_enabled` (false par défaut)** avec
 * un garde-fou qui empêche toute soumission tant qu'il n'est pas explicitement
 * activé.
 */

export type DsnStatus =
  | "draft"
  | "validated"
  | "exported"
  | "submitted"
  | "accepted"
  | "rejected";

/** Squelette d'entité DSN (par établissement × période). Aucune valorisation. */
export interface DSNDeclaration {
  id: string;
  establishmentSiret: string;
  period: string; // "YYYY-MM"
  status: DsnStatus;
  fileRef: string | null; // référence du fichier généré (jamais le contenu social en clair en log)
  organismReturn: string | null; // retour organisme (CRM) — référence
  anomalies: string[]; // libellés d'anomalies / corrections
  createdAt: Date;
  updatedAt: Date;
}

/** Transitions d'état autorisées (machine à états DSN). */
const TRANSITIONS: Record<DsnStatus, DsnStatus[]> = {
  draft: ["validated"],
  validated: ["exported", "draft"],
  exported: ["submitted", "validated"],
  submitted: ["accepted", "rejected"],
  accepted: [], // terminal
  rejected: ["draft"], // reprise après correction
};

/** Vrai si la transition d'état DSN est légale. */
export function canTransitionDsn(from: DsnStatus, to: DsnStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Feature flag obligatoire. Désactivé par défaut : la soumission DSN reste
 * impossible tant que `DSN_SUBMISSION_ENABLED !== "true"`.
 */
export function isDsnSubmissionEnabled(): boolean {
  return process.env.DSN_SUBMISSION_ENABLED === "true";
}

/**
 * Garde-fou : lève une erreur si une soumission DSN est tentée alors que le
 * flag est désactivé. À appeler AVANT toute opération qui mènerait à un dépôt.
 * (Le dépôt réel lui-même reste Tier-3 et n'est pas implémenté ici.)
 */
export function assertDsnSubmissionAllowed(): void {
  if (!isDsnSubmissionEnabled()) {
    throw new Error(
      "[DSN] Soumission désactivée (dsn_submission_enabled=false). Dépôt réel = action humaine (Tier-3)."
    );
  }
}
