/**
 * Contrôle d'accès aux bulletins (Payslip Vault, Étage 4) — logique PURE.
 *
 * Un bulletin de paie est une donnée sensible (révèle la rémunération). On
 * applique le **moindre privilège** : par défaut, accès refusé, sauf règle
 * explicite. Aucune valorisation ici — uniquement de l'autorisation.
 *
 * Hypothèses documentées (à arbitrer côté produit si besoin) :
 *  - responsable magasin = accès « limité » → PAS d'accès au CONTENU du bulletin
 *    (confidentialité salariale / RGPD minimisation). Refus par défaut.
 *  - opposition à la dématérialisation (`paper_required`) → pas de
 *    téléchargement numérique (remise papier).
 *  - le salarié conserve l'accès à SES propres bulletins même après son départ
 *    (droit légal d'accès aux bulletins).
 */

export type PayrollRole = "GROUP_ADMIN" | "HR_MANAGER" | "STORE_MANAGER" | "EMPLOYEE";

export interface PayrollActor {
  role: PayrollRole;
  employeeId?: string; // requis pour le rôle EMPLOYEE
}

export interface PayslipRef {
  employeeId: string;
  establishmentId: string;
  deliveryMode: "digital" | "paper_required";
  employeeActive: boolean; // false = salarié parti
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
}

/** Décide si l'acteur peut accéder au CONTENU d'un bulletin. */
export function canAccessPayslip(actor: PayrollActor, slip: PayslipRef): AccessDecision {
  switch (actor.role) {
    case "GROUP_ADMIN":
      return { allowed: true };

    case "HR_MANAGER":
      // Accès RH complet aux bulletins.
      return { allowed: true };

    case "STORE_MANAGER":
      // Accès « limité » : pas de contenu de bulletin (confidentialité salariale).
      return { allowed: false, reason: "store_manager_no_payslip_content" };

    case "EMPLOYEE": {
      if (!actor.employeeId || actor.employeeId !== slip.employeeId) {
        return { allowed: false, reason: "not_owner" };
      }
      if (slip.deliveryMode === "paper_required") {
        return { allowed: false, reason: "paper_required" };
      }
      // Le salarié garde l'accès à ses propres bulletins, même après départ.
      return { allowed: true };
    }

    default:
      return { allowed: false, reason: "unknown_role" };
  }
}
