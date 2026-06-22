import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import { hasPermission, isAdmin } from "./rbac";
import type { Permission } from "./rbac";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  employeeId: string | null;
};

// Fake session shape for API key auth
type ServiceSession = {
  user: SessionUser;
};

/**
 * Dual auth: tries NextAuth session first, then Bearer API key.
 * This allows both browser sessions AND service-to-service calls.
 */
export async function getSessionOrUnauthorized(options?: { skipMustChange?: boolean }) {
  // 1. Try NextAuth session (browser cookie)
  const session = await getServerSession(authOptions);
  if (session?.user) {
    if (!options?.skipMustChange && (session.user as { mustChangePassword?: boolean }).mustChangePassword) {
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

  // 2. Try Bearer API key (service-to-service)
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    try {
      const { prisma } = await import("./prisma");
      const key = await prisma.serviceApiKey.findUnique({
        where: { key: apiKey },
      });

      if (key && key.active) {
        // Update last used timestamp (fire-and-forget)
        prisma.serviceApiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});

        // Build a fake session with the key's configured role
        const serviceSession: ServiceSession = {
          user: {
            id: `service:${key.id}`,
            email: `${key.service}@api.timewin24.com`,
            name: key.name,
            role: key.role,
            employeeId: null,
          },
        };
        return { session: serviceSession as any, error: null };
      }
    } catch {
      // DB error — fall through to unauthorized
    }
  }

  return {
    session: null,
    error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
  };
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

/** Shortcut: require ADMIN role (includes SUPER_ADMIN) */
export async function requireAdmin() {
  return requireRole("ADMIN", "SUPER_ADMIN");
}

/** Shortcut: require SUPER_ADMIN role only */
export async function requireSuperAdmin() {
  return requireRole("SUPER_ADMIN");
}

/** Shortcut: require ADMIN or MANAGER role (includes SUPER_ADMIN) */
export async function requireManagerOrAdmin() {
  return requireRole("SUPER_ADMIN", "ADMIN", "MANAGER");
}

/**
 * Require any authenticated user (ADMIN, MANAGER, or EMPLOYEE).
 */
export async function requireAuthenticated(options?: { skipMustChange?: boolean }) {
  const { session, error } = await getSessionOrUnauthorized(options);
  if (error) return { session: null, error };
  return { session: session!, error: null };
}

/**
 * Require EMPLOYEE role and return the linked employeeId.
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

export async function requireStoreAccess(storeId: string) {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { session: null, error };

  const user = session!.user as SessionUser;

  // Admin/service has access to all stores
  if (isAdmin(user.role)) {
    return { session: session!, error: null };
  }

  if (!user.employeeId) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Aucun profil employé lié — accès magasin impossible" },
        { status: 403 }
      ),
    };
  }

  const { prisma } = await import("./prisma");
  const link = await prisma.storeEmployee.findFirst({
    where: { employeeId: user.employeeId, storeId },
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

export async function getAccessibleStoreIds(): Promise<{ storeIds: string[] | null; error: NextResponse | null }> {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { storeIds: null, error };

  const user = session!.user as SessionUser;

  if (isAdmin(user.role)) {
    return { storeIds: null, error: null };
  }

  if (!user.employeeId) {
    return { storeIds: [], error: null };
  }

  const { prisma } = await import("./prisma");
  const links = await prisma.storeEmployee.findMany({
    where: { employeeId: user.employeeId },
    select: { storeId: true },
  });

  return { storeIds: links.map((l) => l.storeId), error: null };
}

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}
