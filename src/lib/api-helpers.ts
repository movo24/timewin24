import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import { hasPermission, isAdmin } from "./rbac";
import type { AppRole, Permission } from "./rbac";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  employeeId: string | null;
};

export async function getSessionOrUnauthorized(options?: { skipMustChange?: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
    };
  }

  // Enforce password change unless explicitly skipped
  if (!options?.skipMustChange && (session.user as any).mustChangePassword) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Changement de mot de passe requis" },
        { status: 403 }
      ),
    };
  }

  return { session, error: null };
}

/**
 * Require specific role(s). Returns 403 if user doesn't have one of the allowed roles.
 */
export async function requireRole(...allowedRoles: string[]) {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { session: null, error };

  const user = session!.user as SessionUser;
  if (!allowedRoles.includes(user.role)) {
    return {
      session: null,
      error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }),
    };
  }
  return { session: session!, error: null };
}

/** Shortcut: require ADMIN role */
export async function requireAdmin() {
  return requireRole("ADMIN");
}

/** Shortcut: require ADMIN or MANAGER role */
export async function requireManagerOrAdmin() {
  return requireRole("ADMIN", "MANAGER");
}

/**
 * Require any authenticated user (ADMIN, MANAGER, or EMPLOYEE).
 * Returns the session with typed user.
 */
export async function requireAuthenticated(options?: { skipMustChange?: boolean }) {
  const { session, error } = await getSessionOrUnauthorized(options);
  if (error) return { session: null, error };
  return { session: session!, error: null };
}

/**
 * Require EMPLOYEE role and return the linked employeeId.
 * Returns 403 if not an employee, or 400 if no employee profile linked.
 */
export async function requireEmployee() {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { session: null, employeeId: null, error };

  const user = session!.user as SessionUser;
  if (user.role !== "EMPLOYEE") {
    return {
      session: null,
      employeeId: null,
      error: NextResponse.json({ error: "Accès réservé aux employés" }, { status: 403 }),
    };
  }

  if (!user.employeeId) {
    return {
      session: null,
      employeeId: null,
      error: NextResponse.json(
        { error: "Aucun profil employé lié à ce compte" },
        { status: 400 }
      ),
    };
  }

  return { session: session!, employeeId: user.employeeId, error: null };
}

// ============================================================
// RBAC — Permission-based guards
// ============================================================

/**
 * Require a specific permission.
 * Uses the centralized RBAC matrix from rbac.ts.
 * Returns 403 if the user's role doesn't have the permission.
 */
export async function requirePermission(permission: Permission) {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { session: null, error };

  const user = session!.user as SessionUser;
  if (!hasPermission(user.role, permission)) {
    return {
      session: null,
      error: NextResponse.json(
        { error: `Accès refusé : permission "${permission}" requise` },
        { status: 403 }
      ),
    };
  }
  return { session: session!, error: null };
}

/**
 * Require access to a specific store (multi-store scoping).
 * - ADMIN : accès à tous les magasins
 * - MANAGER : accès seulement aux magasins où il est assigné (StoreEmployee)
 * - EMPLOYEE : accès seulement à son propre magasin (StoreEmployee)
 *
 * Lazy-imports prisma to avoid circular dependency issues.
 */
export async function requireStoreAccess(storeId: string) {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { session: null, error };

  const user = session!.user as SessionUser;

  // Admin has access to all stores
  if (isAdmin(user.role)) {
    return { session: session!, error: null };
  }

  // Manager and Employee: must be linked to the store via StoreEmployee
  if (!user.employeeId) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Aucun profil employé lié — accès magasin impossible" },
        { status: 403 }
      ),
    };
  }

  // Dynamic import to avoid circular dependencies
  const { prisma } = await import("./prisma");
  const link = await prisma.storeEmployee.findFirst({
    where: {
      employeeId: user.employeeId,
      storeId: storeId,
    },
    select: { storeId: true },
  });

  if (!link) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Accès refusé : vous n'êtes pas assigné à ce magasin" },
        { status: 403 }
      ),
    };
  }

  return { session: session!, error: null };
}

/**
 * Get the list of store IDs accessible by the current user.
 * - ADMIN : null (all stores — caller should not filter)
 * - MANAGER/EMPLOYEE : list of assigned storeIds
 */
export async function getAccessibleStoreIds(): Promise<{ storeIds: string[] | null; error: NextResponse | null }> {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { storeIds: null, error };

  const user = session!.user as SessionUser;

  if (isAdmin(user.role)) {
    return { storeIds: null, error: null }; // null = all stores
  }

  if (!user.employeeId) {
    return {
      storeIds: [],
      error: null,
    };
  }

  const { prisma } = await import("./prisma");
  const links = await prisma.storeEmployee.findMany({
    where: { employeeId: user.employeeId },
    select: { storeId: true },
  });

  return {
    storeIds: links.map((l) => l.storeId),
    error: null,
  };
}

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}
