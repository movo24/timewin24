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
import { isSuperAdmin, isPlatformAdmin } from "./rbac";
import { prisma } from "./prisma";
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

// ════════════════════════════════════════════════════════════════════════════
// Helpers avancés multi-tenant
// ════════════════════════════════════════════════════════════════════════════

/**
 * Combine `requireCompanyContext` + check de rôle.
 *
 * Refuse l'accès si l'utilisateur n'a pas un des rôles requis OU s'il n'a
 * pas de companyId (hors SUPER_ADMIN).
 *
 * Usage:
 *   const { ctx, error } = await requireCompanyRole("OWNER", "ADMIN");
 *   if (error) return error;
 */
export async function requireCompanyRole(
  ...allowedRoles: string[]
): Promise<{
  ctx: CompanyContext | null;
  error: NextResponse | null;
}> {
  const { ctx, error } = await requireCompanyContext();
  if (error || !ctx) return { ctx: null, error };

  if (!allowedRoles.includes(ctx.role)) {
    return {
      ctx: null,
      error: NextResponse.json(
        { error: "Accès refusé : rôle insuffisant pour cette action" },
        { status: 403 }
      ),
    };
  }

  return { ctx, error: null };
}

/**
 * Vérifie qu'un store appartient bien à la Company de l'utilisateur courant.
 *
 * - Pour SUPER_ADMIN : check bypassé (accès cross-company autorisé).
 * - Pour OWNER/ADMIN : suffit que store.companyId === ctx.companyId.
 * - Pour MANAGER    : doit aussi être lié au store via StoreEmployee.
 * - Pour EMPLOYEE   : suffit d'avoir au moins un shift dans ce store
 *                    (cas rare, généralement l'employé ne fait pas ça).
 *
 * Retourne `null` si OK, ou une `NextResponse` 403 / 404 sinon.
 */
export async function requireCompanyStoreAccess(
  storeId: string,
  ctx: CompanyContext
): Promise<NextResponse | null> {
  // Plateforme : accès cross-company autorisé
  if (isPlatformAdmin(ctx.role)) return null;

  // Récupérer le store + son companyId
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, companyId: true },
  });
  if (!store) {
    return NextResponse.json(
      { error: "Magasin introuvable" },
      { status: 404 }
    );
  }

  // Cross-company strict
  if (store.companyId && store.companyId !== ctx.companyId) {
    return NextResponse.json(
      { error: "Accès refusé : magasin hors de votre Company" },
      { status: 403 }
    );
  }

  // MANAGER : doit aussi avoir une affectation StoreEmployee sur ce store
  if (ctx.role === "MANAGER") {
    // (le manager peut avoir un employeeId lié à un employé)
    const userWithEmployee = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { employeeId: true },
    });
    if (userWithEmployee?.employeeId) {
      const link = await prisma.storeEmployee.findFirst({
        where: { storeId, employeeId: userWithEmployee.employeeId },
        select: { storeId: true },
      });
      if (!link) {
        return NextResponse.json(
          { error: "Accès refusé : magasin hors de votre périmètre manager" },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Manager sans employee lié — contactez le support" },
        { status: 403 }
      );
    }
  }

  return null;
}

/**
 * Retourne la liste des stores accessibles par l'utilisateur, scopée à sa Company.
 *
 * - SUPER_ADMIN              → `null` (unrestricted)
 * - OWNER / ADMIN            → tous les stores de la Company
 * - MANAGER                  → stores liés via StoreEmployee (dans la Company)
 * - EMPLOYEE                 → stores liés via StoreEmployee (dans la Company)
 *
 * ⚠ Ne JAMAIS retourner `null` pour autre chose que SUPER_ADMIN. Sinon
 *   un OWNER se retrouverait avec un accès cross-company.
 */
export async function getCompanyScopedStoreIds(
  ctx: CompanyContext
): Promise<string[] | null> {
  if (isPlatformAdmin(ctx.role)) return null;
  if (!ctx.companyId) return []; // sécurité — devrait être bloqué en amont

  // OWNER / ADMIN : tous les stores de la Company
  if (ctx.role === "OWNER" || ctx.role === "ADMIN") {
    const stores = await prisma.store.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }

  // MANAGER / EMPLOYEE : stores liés via StoreEmployee dans la Company
  const userWithEmployee = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { employeeId: true },
  });
  if (!userWithEmployee?.employeeId) return [];

  const links = await prisma.storeEmployee.findMany({
    where: {
      employeeId: userWithEmployee.employeeId,
      store: { companyId: ctx.companyId },
    },
    select: { storeId: true },
  });
  return links.map((l) => l.storeId);
}
