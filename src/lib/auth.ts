import { NextAuthOptions } from "next-auth";
import { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

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
          throw new Error("Email et mot de passe requis");
        }

        console.log(`[AUTH] Login attempt — email: ${credentials.email}`);

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { employee: true },
        });

        if (!user) {
          throw new Error("Aucun compte avec cet email");
        }

        // Check if account is active
        if (!user.active) {
          throw new Error("Compte désactivé. Contactez votre administrateur.");
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutesLeft = Math.ceil(
            (user.lockedUntil.getTime() - Date.now()) / 60000
          );
          throw new Error(
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

          throw new Error("Mot de passe incorrect");
        }

        console.log(`[AUTH] Password OK — role: ${user.role}`);

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

        console.log(`[AUTH] SUCCESS — user: ${user.email}, role: ${user.role}`);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          employeeId: user.employeeId,
          mustChangePassword: user.mustChangePassword,
          passwordChangedAt: user.passwordChangedAt,
        };
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
        console.log(`[JWT] Fresh token created — role: ${user.role}, email: ${user.email}`);
      }

      // On token refresh (no user), verify user is still active and password hasn't changed
      if (!user && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { passwordChangedAt: true, active: true, role: true },
        });
        if (!dbUser || !dbUser.active) {
          console.log(`[JWT] INVALIDATED — user ${token.sub} not found or inactive`);
          return {} as JWT;
        }
        const dbPwdAt = dbUser.passwordChangedAt?.toISOString() || null;
        const tokenPwdAt = token.passwordChangedAt
          ? (typeof token.passwordChangedAt === "string"
              ? token.passwordChangedAt
              : (token.passwordChangedAt as Date).toISOString())
          : null;
        if (dbPwdAt !== tokenPwdAt) {
          console.log(`[JWT] INVALIDATED — password changed. DB: ${dbPwdAt}, Token: ${tokenPwdAt}`);
          return {} as JWT;
        }
        // Also sync role in case it changed in DB
        if (dbUser.role !== token.role) {
          console.log(`[JWT] Role synced: ${token.role} → ${dbUser.role}`);
          token.role = dbUser.role;
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
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
};
