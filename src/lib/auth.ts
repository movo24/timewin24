import { NextAuthOptions } from "next-auth";
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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { employee: true },
        });

        if (!user) {
          throw new Error("Identifiants invalides");
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

          throw new Error("Identifiants invalides");
        }

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

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          employeeId: user.employeeId,
          mustChangePassword: user.mustChangePassword,
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
