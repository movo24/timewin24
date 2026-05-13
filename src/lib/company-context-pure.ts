/**
 * Company context — couche PURE multi-tenant.
 *
 * Ce module ne dépend ni de Prisma ni de NextAuth — il est testable
 * directement par Jest sans setup serveur.
 *
 * Le module `company-context.ts` (qui touche NextAuth + Prisma) re-exporte
 * tout ce qui est ici, pour que les routes API n'aient qu'un import.
 */

/**
 * Contexte tenant courant pour une requête authentifiée.
 *
 * - `companyId === null` UNIQUEMENT pour SUPER_ADMIN (staff plateforme).
 *   Pour tout autre rôle, l'absence de companyId est une erreur 403.
 */
export interface CompanyContext {
  userId: string;
  role: string;
  /** null = SUPER_ADMIN (staff plateforme), accès cross-company autorisé */
  companyId: string | null;
  /** true = peut accéder à toutes les companies (SUPER_ADMIN uniquement) */
  isPlatformAdmin: boolean;
}

/**
 * Erreur levée par `enforceCompanyScope` en cas de tentative cross-company.
 * À catcher dans les routes API pour retourner un 403 explicite.
 */
export class CrossCompanyAccessError extends Error {
  readonly isCrossCompanyAccess = true as const;
  constructor(message: string) {
    super(message);
    this.name = "CrossCompanyAccessError";
  }
}

/**
 * Injecte automatiquement `companyId` dans un filtre Prisma `where`.
 *
 * - Pour SUPER_ADMIN, le filtre passe inchangé (cross-company autorisé).
 * - Pour tout autre rôle, force `where.companyId = ctx.companyId`.
 *   Si l'appelant a déjà mis un `companyId` différent → 🛑 throws.
 *
 * Usage:
 *   const where = enforceCompanyScope({ active: true }, ctx);
 *   await prisma.employee.findMany({ where });
 */
export function enforceCompanyScope<T extends Record<string, unknown>>(
  where: T,
  ctx: CompanyContext
): T & { companyId?: string } {
  // SUPER_ADMIN : aucun filtre forcé (peut volontairement filtrer par companyId
  // dans son `where` s'il veut cibler une company précise).
  if (ctx.isPlatformAdmin) {
    return where;
  }

  // Cross-company tentative détectée
  if (
    typeof where.companyId === "string" &&
    where.companyId !== ctx.companyId
  ) {
    throw new CrossCompanyAccessError(
      `Tentative d'accès cross-company détectée: ${where.companyId} ≠ ${ctx.companyId}`
    );
  }

  // Companyless context (devrait être bloqué en amont par requireCompanyContext)
  if (!ctx.companyId) {
    throw new CrossCompanyAccessError(
      "enforceCompanyScope appelé sans companyId pour rôle non-SUPER_ADMIN"
    );
  }

  return { ...where, companyId: ctx.companyId };
}

/**
 * Permissions intra-company basées sur la hiérarchie SaaS.
 *
 * Hiérarchie (du plus haut au plus bas) :
 *   SUPER_ADMIN  (5) — staff plateforme TimeWin24 (multi-company)
 *   OWNER        (4) — propriétaire de la Company (1 par Company)
 *   ADMIN        (3) — admin de la Company
 *   MANAGER      (2) — manager d'un ou plusieurs sites
 *   EMPLOYEE     (1) — accès à ses propres données uniquement
 */
export const SAAS_ROLE_LEVEL: Record<string, number> = {
  SUPER_ADMIN: 5,
  OWNER: 4,
  ADMIN: 3,
  MANAGER: 2,
  EMPLOYEE: 1,
};

/** Retourne true si l'utilisateur a au moins le niveau requis. */
export function hasMinimumSaasRole(
  userRole: string,
  required: keyof typeof SAAS_ROLE_LEVEL
): boolean {
  const userLevel = SAAS_ROLE_LEVEL[userRole] ?? 0;
  const requiredLevel = SAAS_ROLE_LEVEL[required] ?? 0;
  return userLevel >= requiredLevel;
}

/** True si le rôle correspond au propriétaire d'une Company. */
export function isOwner(role: string): boolean {
  return role === "OWNER";
}

/** True si le rôle peut administrer la Company (OWNER, ADMIN ou SUPER_ADMIN). */
export function isCompanyAdmin(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "SUPER_ADMIN";
}
