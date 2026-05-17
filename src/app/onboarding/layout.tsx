/**
 * Layout commun de l'onboarding — header avec stepper visuel.
 */
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FLAGS } from "@/lib/feature-flags";
import { OnboardingStepper } from "@/components/onboarding/stepper";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!FLAGS.onboarding) redirect("/dashboard");

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = session.user as { role: string };
  if (user.role !== "OWNER") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xl font-bold text-gray-900">TimeWin24</span>
            <span className="text-xs text-gray-400">Onboarding</span>
          </div>
          <OnboardingStepper />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
