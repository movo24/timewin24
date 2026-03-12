import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// Routes that require authentication
const PROTECTED_ROUTES = [
  "/planning",
  "/employees",
  "/stores",
  "/costs",
  "/pointages",
  "/remplacements",
  "/echanges",
  "/marche-shifts",
  "/alertes",
  "/annonces",
  "/audit",
  "/accounts",
  "/notifications",
  "/messages",
  "/integrations",
  "/journal",
  "/fil-actualite",
  // Employee routes
  "/mon-planning",
  "/mes-absences",
  "/mes-remplacements",
  "/mes-messages",
  "/mes-notifications",
  "/pointage",
  "/absences",
];

// Routes that don't need auth
const PUBLIC_ROUTES = ["/login", "/admin-login", "/api/auth"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip public routes and static assets
  if (
    PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Check if this is a protected route
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (!isProtected) return NextResponse.next();

  // Check for valid session token
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check mustChangePassword
  if (token.mustChangePassword && pathname !== "/changer-mot-de-passe") {
    return NextResponse.redirect(new URL("/changer-mot-de-passe", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
