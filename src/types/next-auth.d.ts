import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    employeeId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      employeeId: string | null;
      mustChangePassword: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    employeeId: string | null;
    mustChangePassword: boolean;
    passwordChangedAt: Date | null;
  }
}
