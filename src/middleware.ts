import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// Route classifications — mirrored from rbac.ts (middleware can't import from src/lib due to Edge Runtime)
// IMPORTANT: keep in sync with ADMIN_ROUTES in src/lib/rbac.ts
const ADMIN_ROUTES = [
  "/dashboard",
  "/planning", "/employees", "/stores", "/costs", "/pointages",
  "/remplacements", "/echanges", "/alertes", "/audit", "/accounts",
  "/integrations", "/journal", "/absences", "/notifications", "/messages",
  "/organizations", "/units", "/connected-apps", "/pos-events",
  "/etiquettes", "/performance",
  // SaaS App Store
  "/onboarding",
];

const EMPLOYEE_ROUTES = [
  "/mon-planning", "/mes-absences", "/mes-remplacements",
  "/mes-messages", "/mes-notifications", "/pointage", "/marche-shifts",
];

const SHARED_ROUTES = [
  "/fil-actualite",
  "/annonces",
  // Account deletion (Apple App Store) — accessible à tous les rôles connectés
  "/account",
];

const PROTECTED_ROUTES = [...ADMIN_ROUTES, ...EMPLOYEE_ROUTES, ...SHARED_ROUTES];
const LOGIN_PAGES = ["/login", "/admin-login"];
const PUBLIC_ROUTES = [
  "/login",
  "/admin-login",
  "/api/auth",
  "/changer-mot-de-passe",
  // SaaS App Store pages publiques (Apple Store guidelines)
  "/privacy",
  "/terms",
  "/support",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip static assets and inventory routes (own JWT auth)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/inventory") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Get token — force secureCookie based on actual request protocol
  // (NEXTAUTH_URL env var may be misconfigured on Vercel, causing getToken
  //  to look for the wrong cookie name)
  const isSecure = req.nextUrl.protocol === "https:";
  const cookieName = isSecure
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName,
  });
  const role = (token?.role as string) || null;
  const isAuthenticated = !!(token && role);
  const isEmployeeRole = role === "EMPLOYEE";

  // --- Login pages: redirect already-authenticated users to their dashboard ---
  if (LOGIN_PAGES.some((r) => pathname === r)) {
    if (isAuthenticated) {
      const target = isEmployeeRole ? "/mon-planning" : "/dashboard";
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
