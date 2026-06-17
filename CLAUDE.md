# CLAUDE.md — TimeWin24

Guardrails for AI assistants working in this repo. Read before editing. Verified against the
codebase on 2026-06-17.

## What this is
TimeWin24 — a multi-tenant SaaS for retail/multi-store staff scheduling, time tracking, and HR
ops, with an iOS wrapper. Production runs at `app.timewin24.com` on Vercel. Comments in the
codebase are in French; matching that is fine.

## Stack (verified from package.json)
- Next.js **16.1.6** (App Router) · React **19.2.3** · TypeScript 5
- Auth: NextAuth **4.24.13** (Credentials + bcryptjs, JWT sessions)
- DB: Prisma **7.4.1** + `@prisma/adapter-pg` + PostgreSQL (Neon)
- Mobile: Capacitor **8.3.4** (iOS, Remote URL mode → `app.timewin24.com`)
- UI: Tailwind 4 + Radix UI + recharts + lucide-react
- Validation: Zod **4.3.6** · Notifications: web-push (VAPID) + nodemailer · AI: `@google/generative-ai` (Gemini)

## Architecture
Tenancy layers: **Platform** (SUPER_ADMIN, TimeWin24 staff) → **Company** (1) → **Stores** (n) →
**Employees/Users** (n).

- **RBAC** — `src/lib/rbac.ts`. Roles, strongest to weakest: `SUPER_ADMIN > OWNER > ADMIN > MANAGER > EMPLOYEE`. OWNER ≠ SUPER_ADMIN (company owner is not platform staff).
- **Tenant scoping** — `src/lib/company-context.ts` (+ `company-context-pure.ts`). Helpers:
  `getCompanyContext`, `requireCompanyContext`, `requireCompanyRole`, `requireCompanyStoreAccess`,
  `getCompanyScopedStoreIds`, `enforceCompanyScope`, `isCompanyAdmin`, `isCompanyScoped`.
- **Feature flags** — `src/lib/feature-flags.ts`. Variants: `appstore` (SaaS prod) vs `fullstack` (legacy internal).
- **Schema** — single file `prisma/schema.prisma` (57 models, 24 migrations).
- **Routes** — `src/app/` with route groups `(auth)`, `(dashboard)`, `(employee)`, `(shared)`, plus
  `account`, `api`, `inventory`, `onboarding`, `privacy`, `support`, `terms`. 130 API `route.ts` handlers.
- **Other lib modules** — `auth.ts`, `prisma.ts`, `validations.ts`, `rate-limit.ts`, `audit.ts`,
  `platform.ts`, `marketplace.ts`, `hmac.ts`, `geo.ts`, `pos-auth.ts`, `inventory-jwt.ts`, plus
  `ai-engine/`, `pos/`, `solver/`, `timesheet/`, `notifications/`, `manager-ia/`, `analytics/`, `labels/`.

## Commands
- `npm run dev` — local dev server
- `npm run build` — `prisma generate && next build` (prod build; safe locally)
- `npm test` — Jest (15 suites, 319 tests)
- `npm run lint` — ESLint
- DB (LOCAL ONLY — see safety rules): `db:migrate` (migrate dev), `db:push`, `db:seed`,
  `db:reset` (= `prisma db push --force-reset` → **WIPES the DB**), `setup`

## Safety rules (hard constraints)
1. **Never touch production.** All `db:*` scripts target the local DB only. Never run `prisma
   migrate dev/deploy`, `db push`, or `db:reset` against a prod/Neon URL. `db:reset` force-resets
   (destroys all data) — local only, never prod. Prod schema changes ship via the Vercel build
   pipeline, not manual commands.
2. **No destructive migration without explicit user validation.** Any change to a cross-tenant
   model (Company, Store, User, Employee) must be confirmed before generating a migration.
3. **No hardcoded secrets.** `.env`, `.env.production`, `.env.local` are gitignored and must stay
   untracked — only `*.example` files are committed (placeholders only). Real values live in Vercel
   env vars. Never `git add -f` an env file.
4. **Multi-tenant scoping is mandatory.** Every data access must be scoped by company via the
   `company-context.ts` helpers (filter by `companyId` / scoped store IDs). Never query across
   tenants without going through `enforceCompanyScope` / `requireCompanyContext`.
5. **RBAC is explicit.** Gate actions through `src/lib/rbac.ts` — no implicit role inference.
6. **Validate inputs with Zod** (`src/lib/validations.ts`) on every API route.
7. **No raw-HTML injection and no `eval`.** Avoid React's dangerous inner-HTML prop; sanitize any
   HTML. CSP is strict (`frame-ancestors 'none'`, HSTS) in `next.config.ts`.
8. **No useless refactors.** Don't restructure working code (e.g. don't add `vercel.json`/`vercel.ts`
   to duplicate config already in `next.config.ts`) unless it fixes a real problem.

## Tests & verification
- Run `npm test` before committing anything under `src/lib/`.
- Prioritize coverage for tenant scoping, RBAC, and feature flags (these guard correctness).
- Tests must never hit a prod DB.
- Current baseline (2026-06-17): typecheck clean, 319/319 tests pass, build succeeds.

## Git workflow
Branches:
- `main` — legacy / default base
- `appstore-saas` — SaaS production (deploys to `app.timewin24.com`)
- `mobile-ios` — Capacitor iOS wrapper (do not merge to prod without intent)
- `feat/*`, `fix/*` — feature/fix branches

Rules: never force-push `main` or `appstore-saas`. Commit prefixes: `feat(scope):`, `fix(scope):`,
`chore(scope):`, `docs:`.

## Before modifying code
1. Read this file.
2. `git status` + `git log -10` for context.
3. Touching a model? `npx prisma migrate status` first; never migrate against prod.
4. Touching RBAC or feature-flags? Add/adjust unit tests.

## Sub-projects / docs
- iOS submission: `docs/APP_STORE_SUBMISSION_CHECKLIST.md`
- App Store Connect Issuer ID setup is a separate, paused workstream.
