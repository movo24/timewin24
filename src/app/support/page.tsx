/**
 * /support — Page de support utilisateur
 *
 * Required by Apple App Store guidelines (App Store Connect → Support URL).
 * Public route — no authentication required.
 */
import { Mail, BookOpen, Bug, Trash2, Lock } from "lucide-react";

export const metadata = {
  title: "Support — TimeWin24",
  description: "Aide et support TimeWin24.",
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Support TimeWin24</h1>
        <p className="text-sm text-gray-500 mb-8">
          Besoin d&apos;aide ? Voici comment nous joindre.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          {/* Card — Contact général */}
          <a
            href="mailto:support@timewin24.app"
            className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Email support</h2>
                <p className="text-sm text-gray-500 mb-2">
                  Réponse sous 24h ouvrées
                </p>
                <p className="text-sm font-mono text-blue-700">
                  support@timewin24.app
                </p>
              </div>
            </div>
          </a>

          {/* Card — Bug report */}
          <a
            href="mailto:bug@timewin24.app"
            className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Bug className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Signaler un bug</h2>
                <p className="text-sm text-gray-500 mb-2">
                  Décris ce que tu fais, ce qui devrait arriver, et ce qui se passe.
                </p>
                <p className="text-sm font-mono text-red-700">bug@timewin24.app</p>
              </div>
            </div>
          </a>

          {/* Card — Sécurité */}
          <a
            href="mailto:security@timewin24.app"
            className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Lock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Sécurité</h2>
                <p className="text-sm text-gray-500 mb-2">
                  Vulnérabilité, fuite de données suspectée, accès anormal.
                </p>
                <p className="text-sm font-mono text-amber-700">
                  security@timewin24.app
                </p>
              </div>
            </div>
          </a>

          {/* Card — Documentation */}
          <a
            href="https://docs.timewin24.app"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Documentation</h2>
                <p className="text-sm text-gray-500 mb-2">
                  Guides utilisateur, tutoriels, FAQ.
                </p>
                <p className="text-sm text-green-700">docs.timewin24.app →</p>
              </div>
            </div>
          </a>
        </div>

        {/* FAQ courte */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Questions fréquentes</h2>

          <details className="border-b border-gray-100 py-3">
            <summary className="font-medium text-gray-800 cursor-pointer">
              Comment supprimer mon compte ?
            </summary>
            <div className="mt-2 text-sm text-gray-600 space-y-2">
              <p>
                Connectez-vous, allez dans votre profil, et cliquez sur &quot;Supprimer
                mon compte&quot;. Une confirmation par mot de passe est requise.
              </p>
              <p>
                <a
                  href="/account/delete"
                  className="text-blue-600 underline flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Aller à la suppression de compte
                </a>
              </p>
            </div>
          </details>

          <details className="border-b border-gray-100 py-3">
            <summary className="font-medium text-gray-800 cursor-pointer">
              J&apos;ai oublié mon mot de passe
            </summary>
            <div className="mt-2 text-sm text-gray-600">
              <p>
                Si vous êtes employé, contactez votre manager qui peut réinitialiser
                votre mot de passe. Si vous êtes administrateur, contactez-nous à{" "}
                <a href="mailto:support@timewin24.app" className="text-blue-600 underline">
                  support@timewin24.app
                </a>.
              </p>
            </div>
          </details>

          <details className="border-b border-gray-100 py-3">
            <summary className="font-medium text-gray-800 cursor-pointer">
              Comment exporter mes données ?
            </summary>
            <div className="mt-2 text-sm text-gray-600">
              <p>
                Envoyez un email à{" "}
                <a href="mailto:privacy@timewin24.app" className="text-blue-600 underline">
                  privacy@timewin24.app
                </a>{" "}
                en précisant le scope de l&apos;export. Réponse sous 7 jours conformément
                au RGPD.
              </p>
            </div>
          </details>

          <details className="py-3">
            <summary className="font-medium text-gray-800 cursor-pointer">
              Mes données sont-elles en sécurité ?
            </summary>
            <div className="mt-2 text-sm text-gray-600">
              <p>
                Oui. Données hébergées dans l&apos;UE (AWS Frankfurt), mots de passe hachés
                (bcrypt), connexions HTTPS, isolation multi-tenant stricte. Voir notre{" "}
                <a href="/privacy" className="text-blue-600 underline">
                  politique de confidentialité
                </a>.
              </p>
            </div>
          </details>
        </section>

        <p className="text-center text-sm text-gray-400">
          TimeWin24 — Gestion de planning pour entreprises<br />
          <a href="/terms" className="hover:underline">CGU</a> ·{" "}
          <a href="/privacy" className="hover:underline">Confidentialité</a>
        </p>
      </main>
    </div>
  );
}
