import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || "";

  // Try with explicit secret
  const token1 = await getToken({ req, secret });

  // Try without explicit secret (uses NEXTAUTH_SECRET env auto)
  const token2 = await getToken({ req });

  // Try with trimmed secret
  const token3 = await getToken({ req, secret: secret.trim() });

  const session = await getServerSession(authOptions);

  const cookies = req.cookies.getAll().map(c => ({ name: c.name, length: c.value.length }));

  return NextResponse.json({
    token1_explicit: !!token1,
    token2_auto: !!token2,
    token3_trimmed: !!token3,
    token3_role: token3?.role || null,
    hasSession: !!session,
    sessionRole: session?.user?.role || null,
    secretLength: secret.length,
    secretTrimmedLength: secret.trim().length,
    secretFirst3: secret.substring(0, 3),
    secretLast3: secret.substring(secret.length - 3),
    secretHasNewline: secret.includes('\n'),
    secretHasReturn: secret.includes('\r'),
    cookies,
    nextauthUrl: process.env.NEXTAUTH_URL || 'NOT_SET',
    nextauthUrlLength: (process.env.NEXTAUTH_URL || '').length,
  });
}
