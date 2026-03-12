import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdminOrManager, getDefaultRouteForRole } from "@/lib/rbac";
import { Sidebar } from "@/components/sidebar";
import { PushPermission } from "@/components/notifications/push-permission";
import { InstallPrompt } from "@/components/notifications/install-prompt";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/admin-login");

  // Forcer le changement de mot de passe à la première connexion
  if (session.user.mustChangePassword) redirect("/changer-mot-de-passe");

  // Seuls ADMIN et MANAGER accèdent au dashboard
  if (!isAdminOrManager(session.user.role)) redirect(getDefaultRouteForRole(session.user.role));

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
