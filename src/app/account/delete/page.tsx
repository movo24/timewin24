/**
 * /account/delete — Page de suppression de compte (Apple App Store requirement)
 *
 * Auth required. Demande confirmation par mot de passe avant de POST sur
 * /api/account/delete.
 */
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AccountDeleteForm } from "@/components/account/delete-form";

export const metadata = {
  title: "Supprimer mon compte — TimeWin24",
};

export default async function AccountDeletePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = session.user as { email: string; role: string; name: string };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Supprimer mon compte
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Cette action est irréversible. Vos données opérationnelles (shifts passés,
          audit) peuvent être conservées par votre employeur pour des raisons légales.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-900 font-medium mb-1">
            ⚠ Avant de continuer
          </p>
          <ul className="text-sm text-amber-800 space-y-1 list-disc pl-5">
            {user.role === "OWNER" ? (
              <>
                <li>
                  Vous êtes <strong>propriétaire</strong> (OWNER) — supprimer votre compte
                  va aussi <strong>supprimer toute votre société</strong> (employés, sites,
                  plannings).
                </li>
                <li>
                  Les données opérationnelles passent en lecture seule pendant 30 jours
                  puis sont purgées définitivement.
                </li>
                <li>
                  Si vous voulez juste quitter mais conserver la société, transférez
                  d&apos;abord la propriété à un autre administrateur via le support.
                </li>
              </>
            ) : (
              <>
                <li>
                  Votre compte de connexion sera supprimé immédiatement.
                </li>
                <li>
                  Votre fiche employé (shifts passés, pointages, audit) reste conservée
                  par votre employeur pour des raisons légales.
                </li>
                <li>
                  Pour une suppression complète, contactez votre employeur.
                </li>
              </>
            )}
          </ul>
        </div>

        <AccountDeleteForm
          userEmail={user.email}
          userName={user.name}
          userRole={user.role}
        />

        <p className="text-xs text-center text-gray-400 mt-8">
          Une question avant de supprimer ?{" "}
          <a href="/support" className="text-blue-600 underline">
            Page support
          </a>
        </p>
      </main>
    </div>
  );
}
