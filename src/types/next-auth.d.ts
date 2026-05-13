import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    employeeId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
    /**
     * Multi-tenant SaaS — Company à laquelle ce User appartient.
     * - `null` = SUPER_ADMIN (staff plateforme, accès cross-company) ou
     *           compte hérité avant backfill multi-tenant.
     * - `string` = id de la Company pour OWNER / ADMIN / MANAGER / EMPLOYEE.
     *
     * Phase 2 : câblé runtime par les callbacks NextAuth (auth.ts).
     *           Sera rendu obligatoire (sans null possible pour les rôles
     *           non-SUPER_ADMIN) après le backfill DB en Phase 3.
     */
    companyId: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      employeeId: string | null;
      mustChangePassword: boolean;
      /** Multi-tenant SaaS — voir doc sur `User.companyId` ci-dessus. */
      companyId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    employeeId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
    /** Multi-tenant SaaS — voir doc sur `User.companyId`. */
    companyId: string | null;
  }
}
