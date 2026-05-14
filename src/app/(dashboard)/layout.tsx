import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminOrManager, getDefaultRouteForRole } from "@/lib/rbac";
import { Sidebar } from "@/components/sidebar";
import { PushPermission } from "@/components/notifications/push-permission";
import { InstallPrompt } from "@/components/notifications/install-prompt";
import { FLAGS } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/admin-login");

  // Forcer le changement de mot de passe à la première connexion
  if (session.user.mustChangePassword) redirect("/changer-mot-de-passe");

  // Seuls ADMIN, MANAGER, OWNER, SUPER_ADMIN accèdent au dashboard
  if (!isAdminOrManager(session.user.role)) redirect(getDefaultRouteForRole(session.user.role));

  // SaaS App Store — OWNER avec onboarding non-terminé → redirect /onboarding
  if (
    FLAGS.onboarding &&
    session.user.role === "OWNER" &&
    session.user.companyId
  ) {
    const company = await prisma.company.findUnique({
      where: { id: session.user.companyId },
      select: { onboardingStep: true },
    });
    if (company && (company.onboardingStep ?? 0) < 99) {
      redirect("/onboarding");
    }
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:pl-60">
        <div className="p-4 lg:p-6 pt-14 lg:pt-6">{children}</div>
      </main>
      <PushPermission />
      <InstallPrompt />
    </div>
  );
}
