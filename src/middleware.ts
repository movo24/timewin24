import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// Route classifications — mirrored from rbac.ts (middleware can't import from src/lib)
const ADMIN_ROUTES = [
  "/planning", "/employees", "/stores", "/costs", "/pointages",
  "/remplacements", "/echanges", "/alertes", "/audit", "/accounts",
  "/integrations", "/journal", "/absences", "/notifications", "/messages",
];

const EMPLOYEE_ROUTES = [
  "/mon-planning", "/mes-absences", "/mes-remplacements",
  "/mes-messages", "/mes-notifications", "/pointage", "/marche-shifts",
];

const SHARED_ROUTES = ["/fil-actualite", "/annonces"];

const PROTECTED_ROUTES = [...ADMIN_ROUTES, ...EMPLOYEE_ROUTES, ...SHARED_ROUTES];
const LOGIN_PAGES = ["/login", "/admin-login"];
const PUBLIC_ROUTES = ["/login", "/admin-login", "/api/auth", "/changer-mot-de-passe"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Get token once for all checks
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const role = (token?.role as string) || null;
  const isAuthenticated = !!(token && role);
  const isEmployeeRole = role === "EMPLOYEE";

  // --- Login pages: redirect already-authenticated users to their dashboard ---
  if (LOGIN_PAGES.some((r) => pathname === r)) {
    if (isAuthenticated) {
      const target = isEmployeeRole ? "/mon-planning" : "/planning";
      return NextResponse.redirect(new URL(target, req.url));
    }
    return NextResponse.next();
  }

  // Skip other public routes
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Check if this is a protected route
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (!isProtected) return NextResponse.next();

  // --- No valid session → redirect to correct login page ---
  if (!isAuthenticated) {
    const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
    const loginPath = isAdminRoute ? "/admin-login" : "/login";
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Force password change ---
  if (token.mustChangePassword && pathname !== "/changer-mot-de-passe") {
    return NextResponse.redirect(new URL("/changer-mot-de-passe", req.url));
  }

  // --- Role-based route protection ---
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  const isEmployeeRoute = EMPLOYEE_ROUTES.some((r) => pathname.startsWith(r));

  // Employee on admin route → employee dashboard
  if (isEmployeeRole && isAdminRoute) {
    return NextResponse.redirect(new URL("/mon-planning", req.url));
  }

  // Admin/Manager on employee route → admin dashboard
  if (!isEmployeeRole && isEmployeeRoute) {
    return NextResponse.redirect(new URL("/planning", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
