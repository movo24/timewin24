import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

  // Redirect EMPLOYEE to their dedicated portal
  if (session.user.role === "EMPLOYEE") redirect("/mon-planning");

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
