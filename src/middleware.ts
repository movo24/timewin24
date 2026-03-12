import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// Admin-only routes (dashboard)
const ADMIN_ROUTES = [
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
  "/integrations",
  "/journal",
];

// Employee-only routes
const EMPLOYEE_ROUTES = [
  "/mon-planning",
  "/mes-absences",
  "/mes-remplacements",
  "/mes-messages",
  "/mes-notifications",
  "/pointage",
  "/absences",
];

// Shared routes (accessible by both roles)
const SHARED_ROUTES = [
  "/notifications",
  "/messages",
  "/fil-actualite",
];

// All protected routes combined
const PROTECTED_ROUTES = [...ADMIN_ROUTES, ...EMPLOYEE_ROUTES, ...SHARED_ROUTES];

// Auth pages
const LOGIN_PAGES = ["/login", "/admin-login"];

// Routes that don't need auth
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

  // Get token for all route checks
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const role = (token?.role as string) || null;
  const isAuthenticated = !!(token && role);
  const isEmployee = role === "EMPLOYEE";

  // --- Handle login pages: redirect already-authenticated users ---
  if (LOGIN_PAGES.some((r) => pathname === r)) {
    if (isAuthenticated) {
      // Already logged in — redirect to appropriate dashboard
      if (isEmployee) {
        // Employee on admin-login → send to employee dashboard
        if (pathname === "/admin-login") {
          return NextResponse.redirect(new URL("/mon-planning", req.url));
        }
        // Employee on /login → send to employee dashboard (already logged in)
        return NextResponse.redirect(new URL("/mon-planning", req.url));
      } else {
        // Admin on /login → send to admin dashboard
        if (pathname === "/login") {
          return NextResponse.redirect(new URL("/planning", req.url));
        }
        // Admin on /admin-login → send to admin dashboard (already logged in)
        return NextResponse.redirect(new URL("/planning", req.url));
      }
    }
    // Not authenticated on login page → let them through
    return NextResponse.next();
  }

  // Skip other public routes
  if (
    PUBLIC_ROUTES.some((r) => pathname.startsWith(r))
  ) {
    return NextResponse.next();
  }

  // Check if this is a protected route
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (!isProtected) return NextResponse.next();

  // --- No valid session on protected route ---
  if (!isAuthenticated) {
    // Redirect to the CORRECT login page based on which route they tried to access
    const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
    const loginPath = isAdminRoute ? "/admin-login" : "/login";
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    console.log(`[MW] No session — redirecting ${pathname} → ${loginPath}`);
    return NextResponse.redirect(loginUrl);
  }

  // Check mustChangePassword
  if (token.mustChangePassword && pathname !== "/changer-mot-de-passe") {
    return NextResponse.redirect(new URL("/changer-mot-de-passe", req.url));
  }

  // --- Role-based route protection ---
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  const isEmployeeRoute = EMPLOYEE_ROUTES.some((r) => pathname.startsWith(r));

  // Employee trying to access admin routes → redirect to employee dashboard
  if (isEmployee && isAdminRoute) {
    console.log(`[MW] Employee blocked from admin route ${pathname} → /mon-planning`);
    return NextResponse.redirect(new URL("/mon-planning", req.url));
  }

  // Admin/Manager trying to access employee-only routes → redirect to admin dashboard
  if (!isEmployee && isEmployeeRoute) {
    console.log(`[MW] Admin blocked from employee route ${pathname} → /planning`);
    return NextResponse.redirect(new URL("/planning", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
