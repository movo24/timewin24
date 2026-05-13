/**
 * Company context — couche d'isolation multi-tenant pour le SaaS App Store.
 *
 * Toute requête sur des entités tenant-scopées (User, Store, Employee, Shift,
 * Unavailability, PlanningNotification, etc.) DOIT être filtrée par companyId.
 *
 * Règle d'or :
 *   - Plus jamais `where: { storeId, ... }` seul → toujours `where: { companyId, ... }`.
 *   - SUPER_ADMIN est le seul rôle qui peut accéder à toutes les companies
 *     (staff plateforme TimeWin24, pas un client).
 *
 * Ce module est utilisé uniquement par les routes /api/* et les Server Components
 * (car il dépend de NextAuth + Prisma). Pour la logique pure (et donc testable
 * sans serveur), utiliser `./company-context-pure`.
 *
 * NB Phase 1 : `session.user.companyId` n'est pas encore peuplé par NextAuth
 *              (lib/auth.ts intact). Cette extension viendra en Phase 2 quand
 *              la DB SaaS sera provisionnée. Le module est prêt techniquement.
 */

import { NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "./api-helpers";
import { isSuperAdmin } from "./rbac";
import type { CompanyContext } from "./company-context-pure";

// Re-exports : toute la logique pure (testable sans serveur) reste l'API publique
export {
  enforceCompanyScope,
  CrossCompanyAccessError,
  SAAS_ROLE_LEVEL,
  hasMinimumSaasRole,
  isOwner,
  isCompanyAdmin,
  type CompanyContext,
} from "./company-context-pure";

/**
 * Récupère le contexte tenant courant.
 * Retourne `{ context: null, error: NextResponse }` si non authentifié OU
 * si l'utilisateur n'a pas de companyId (hors SUPER_ADMIN).
 */
export async function getCompanyContext(): Promise<{
  context: CompanyContext | null;
  error: NextResponse | null;
}> {
  const { session, error } = await getSessionOrUnauthorized();
  if (error || !session) return { context: null, error };

  const user = session.user as {
    id: string;
    role: string;
    companyId?: string | null;
  };

  // SUPER_ADMIN : staff plateforme — accès toutes companies, companyId peut être null
  if (isSuperAdmin(user.role)) {
    return {
      context: {
        userId: user.id,
        role: user.role,
        companyId: user.companyId ?? null,
        isPlatformAdmin: true,
      },
      error: null,
    };
  }

  // Tout autre rôle : companyId obligatoire
  if (!user.companyId) {
    return {
      context: null,
      error: NextResponse.json(
        { error: "Compte sans Company assignée — contactez le support" },
        { status: 403 }
      ),
    };
  }

  return {
    context: {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
      isPlatformAdmin: false,
    },
    error: null,
  };
}

/**
 * Helper court : enveloppe + early-return pour les routes API.
 *
 * Usage:
 *   export async function GET(req: NextRequest) {
 *     const { ctx, error } = await requireCompanyContext();
 *     if (error) return error;
 *     // ctx.companyId est garanti défini (sauf SUPER_ADMIN)
 *   }
 */
export async function requireCompanyContext(): Promise<{
  ctx: CompanyContext | null;
  error: NextResponse | null;
}> {
  const { context, error } = await getCompanyContext();
  return { ctx: context, error };
}
