/**
 * /onboarding — Router page
 *
 * Redirige vers la bonne étape selon Company.onboardingStep :
 *   0 → /onboarding/company
 *   1 → /onboarding/stores
 *   2 → /onboarding/employees
 *   3 → /onboarding/done
 *  99 → /dashboard (onboarding déjà terminé)
 */
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FLAGS } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (!FLAGS.onboarding) redirect("/dashboard");

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = session.user as { id: string; role: string; companyId: string | null };
  if (user.role !== "OWNER") redirect("/dashboard");
  if (!user.companyId) redirect("/dashboard");

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { onboardingStep: true },
  });

  const step = company?.onboardingStep ?? 0;
  if (step >= 99) redirect("/dashboard");
  if (step >= 3) redirect("/onboarding/done");
  if (step === 2) redirect("/onboarding/employees");
  if (step === 1) redirect("/onboarding/stores");
  redirect("/onboarding/company");
}
