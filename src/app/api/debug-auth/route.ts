import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || "";

  // Try with explicit cookie name (the fix)
  const isSecure = req.nextUrl.protocol === "https:";
  const cookieName = isSecure
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const tokenFixed = await getToken({ req, secret, cookieName });

  // Try original way (broken on Vercel due to NEXTAUTH_URL)
  const tokenOriginal = await getToken({ req, secret });

  const session = await getServerSession(authOptions);
  const cookies = req.cookies.getAll().map(c => ({ name: c.name, length: c.value.length }));

  return NextResponse.json({
    tokenFixed: !!tokenFixed,
    tokenFixedRole: tokenFixed?.role || null,
    tokenOriginal: !!tokenOriginal,
    hasSession: !!session,
    sessionRole: session?.user?.role || null,
    cookieName,
    isSecure,
    cookies,
  });
}
