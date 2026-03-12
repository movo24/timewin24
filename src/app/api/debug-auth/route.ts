import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const session = await getServerSession(authOptions);

  const cookies = req.cookies.getAll().map(c => ({ name: c.name, length: c.value.length }));

  return NextResponse.json({
    hasToken: !!token,
    tokenKeys: token ? Object.keys(token) : null,
    tokenRole: token?.role || null,
    tokenSub: token?.sub || null,
    hasSession: !!session,
    sessionRole: session?.user?.role || null,
    hasSecret: !!process.env.NEXTAUTH_SECRET,
    secretLength: process.env.NEXTAUTH_SECRET?.length || 0,
    cookies,
    nextauthUrl: process.env.NEXTAUTH_URL || 'NOT_SET',
  });
}
