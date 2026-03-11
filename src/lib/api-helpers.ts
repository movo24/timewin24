import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  employeeId: string | null;
};

export async function getSessionOrUnauthorized() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }),
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
export async function requireAuthenticated() {
  const { session, error } = await getSessionOrUnauthorized();
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

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}
