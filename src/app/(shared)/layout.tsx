import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (session.user.mustChangePassword) redirect("/changer-mot-de-passe");

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="lg:pl-60">
        <div className="p-4 lg:p-6 pt-14 lg:pt-6">{children}</div>
      </main>
    </div>
  );
}
