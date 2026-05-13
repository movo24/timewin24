import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    employeeId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
    /**
     * Multi-tenant SaaS — Company à laquelle ce User appartient.
     * - null = SUPER_ADMIN (staff plateforme, accès cross-company).
     * - Pour tout autre rôle, devra être peuplé après backfill (Phase 2+).
     *
     * Phase 1 : OPTIONAL (`?`) car la fonction `authorize` existante dans
     *           lib/auth.ts ne le retourne pas encore. Le câblage runtime
     *           (callbacks NextAuth) sera fait en Phase 2 quand la DB SaaS
     *           sera provisionnée. Sera durci en `string | null` (non-optionnel)
     *           à ce moment-là.
     */
    companyId?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      employeeId: string | null;
      mustChangePassword: boolean;
      /** Multi-tenant SaaS — Phase 1 optionnel, voir doc sur `User.companyId`. */
      companyId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    employeeId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
    /** Multi-tenant SaaS — Phase 1 optionnel, voir doc sur `User.companyId`. */
    companyId?: string | null;
  }
}
