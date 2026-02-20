import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";

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

export async function requireAdmin() {
  const { session, error } = await getSessionOrUnauthorized();
  if (error) return { session: null, error };
  if ((session!.user as { role: string }).role !== "ADMIN") {
    return {
      session: null,
      error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }),
    };
  }
  return { session: session!, error: null };
}

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status });
}
