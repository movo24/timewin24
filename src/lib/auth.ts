import { NextAuthOptions } from "next-auth";
import { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/** Errors thrown intentionally by authorize — safe to surface to the client */
class AuthBusinessError extends Error {
  readonly isBusinessError = true as const;
  constructor(message: string) {
    super(message);
    this.name = "AuthBusinessError";
  }
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new AuthBusinessError("Email et mot de passe requis");
        }

        // Login attempt logged at debug level only

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: { employee: true },
          });

          if (!user) {
            throw new AuthBusinessError("Aucun compte avec cet email");
          }

          // Check if account is active
          if (!user.active) {
            throw new AuthBusinessError("Compte désactivé. Contactez votre administrateur.");
          }

          // Check if account is locked
          if (user.lockedUntil && user.lockedUntil > new Date()) {
            const minutesLeft = Math.ceil(
              (user.lockedUntil.getTime() - Date.now()) / 60000
            );
            throw new AuthBusinessError(
              `Compte verrouillé. Réessayez dans ${minutesLeft} minute(s).`
            );
          }

          const isValid = await bcrypt.compare(
            credentials.password,
            user.passwordHash
          );

          if (!isValid) {
            const newAttempts = user.failedAttempts + 1;
            const updateData: { failedAttempts: number; lockedUntil?: Date } = {
              failedAttempts: newAttempts,
            };

            if (newAttempts >= MAX_FAILED_ATTEMPTS) {
              updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
            }

            await prisma.user.update({
              where: { id: user.id },
              data: updateData,
            });

            throw new AuthBusinessError("Mot de passe incorrect");
          }

          // password validated

          // Reset failed attempts + update login audit on successful login
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedAttempts: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
              loginCount: { increment: 1 },
            },
          });

          // Auth success — no sensitive data logged
          // SaaS App Store : on charge aussi le companyId du User (nullable
          // pour SUPER_ADMIN plateforme et pour les comptes hérités avant
          // backfill multi-tenant).
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            employeeId: user.employeeId,
            mustChangePassword: user.mustChangePassword,
            passwordChangedAt: user.passwordChangedAt,
            companyId: user.companyId ?? null,
          };
        } catch (err) {
          // Erreurs métier (mauvais mdp, compte verrouillé…) → on les affiche telles quelles
          if (err instanceof AuthBusinessError) {
            throw new Error(err.message);
          }
          // Erreur système/Prisma → log + message générique
          console.error("[AUTH] Database error:", err instanceof Error ? err.message : err);
          throw new Error("Service temporairement indisponible. Vérifiez la connexion à la base de données.");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.employeeId = user.employeeId;
        token.mustChangePassword = user.mustChangePassword;
        token.passwordChangedAt = user.passwordChangedAt;
        // SaaS multi-tenant — companyId vit dans le JWT pour éviter un round-trip DB
        token.companyId = user.companyId ?? null;
        // JWT created for user
      }

      // On token refresh (no user), verify user is still active and password hasn't changed
      if (!user && token.sub) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { passwordChangedAt: true, active: true, role: true, companyId: true },
          });
          if (!dbUser || !dbUser.active) {
            // Token invalidated — user not found or inactive
            return {} as JWT;
          }
          const dbPwdAt = dbUser.passwordChangedAt?.toISOString() || null;
          const tokenPwdAt = token.passwordChangedAt
            ? (typeof token.passwordChangedAt === "string"
                ? token.passwordChangedAt
                : (token.passwordChangedAt as Date).toISOString())
            : null;
          if (dbPwdAt !== tokenPwdAt) {
            // Token invalidated — password changed
            return {} as JWT;
          }
          // Also sync role in case it changed in DB
          if (dbUser.role !== token.role) {
            // Role synced from DB
            token.role = dbUser.role;
          }
          // Sync companyId aussi — si l'utilisateur a été (ré)affecté à une Company
          if (dbUser.companyId !== token.companyId) {
            token.companyId = dbUser.companyId ?? null;
          }
        } catch (err) {
          // DB unreachable — keep existing token valid to avoid logout storm
          console.error("[JWT] DB unreachable during refresh, keeping token:", err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
        session.user.employeeId = token.employeeId;
        session.user.mustChangePassword = token.mustChangePassword;
        // SaaS multi-tenant — exposé côté Server Components / API helpers
        session.user.companyId = token.companyId ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
};
