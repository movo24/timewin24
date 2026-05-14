/**
 * /terms — Terms of Service / Conditions Générales d'Utilisation
 *
 * Required by Apple App Store guidelines.
 * Public route — no authentication required.
 */
export const metadata = {
  title: "Conditions d'utilisation — TimeWin24",
  description: "Conditions générales d'utilisation de TimeWin24.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Conditions d&apos;utilisation</h1>
        <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : mai 2026</p>

        <section className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <h2 className="text-xl font-semibold text-gray-900">1. Objet</h2>
          <p>
            TimeWin24 est une plateforme SaaS de gestion du temps de travail (plannings,
            employés, pointages, absences) destinée aux entreprises. Ces conditions
            régissent votre utilisation du service.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">2. Acceptation</h2>
          <p>
            En créant un compte TimeWin24 ou en utilisant l&apos;application, vous acceptez
            ces conditions. Si vous n&apos;êtes pas d&apos;accord, n&apos;utilisez pas le service.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">3. Compte utilisateur</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Vous devez fournir des informations exactes lors de la création du compte.</li>
            <li>Vous êtes responsable de la confidentialité de votre mot de passe.</li>
            <li>Le partage de votre compte est interdit.</li>
            <li>Vous pouvez supprimer votre compte à tout moment depuis l&apos;application.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900">4. Usage acceptable</h2>
          <p>Vous vous engagez à ne pas :</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Utiliser le service à des fins illégales ou frauduleuses.</li>
            <li>Tenter d&apos;accéder à des données qui ne vous appartiennent pas (autres Companies, autres comptes).</li>
            <li>Sonder, scanner ou tester la vulnérabilité du service sans autorisation écrite.</li>
            <li>Surcharger le service (denial of service, scraping abusif).</li>
            <li>Falsifier des données (pointages, shifts) à des fins frauduleuses.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900">5. Données et propriété</h2>
          <p>
            Les données que vous saisissez (employés, plannings, shifts) vous appartiennent.
            TimeWin24 ne s&apos;arroge aucun droit de propriété sur vos données. Vous pouvez
            les exporter ou les supprimer à tout moment (voir{" "}
            <a href="/privacy" className="text-blue-600 underline">politique de confidentialité</a>).
          </p>

          <h2 className="text-xl font-semibold text-gray-900">6. Disponibilité</h2>
          <p>
            Nous nous efforçons d&apos;assurer une disponibilité maximale du service. Aucune
            garantie de disponibilité 100% n&apos;est fournie. Les maintenances planifiées sont
            annoncées à l&apos;avance quand c&apos;est possible.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">7. Limitation de responsabilité</h2>
          <p>
            TimeWin24 ne peut être tenu responsable de pertes indirectes (perte d&apos;exploitation,
            perte de chiffre d&apos;affaires) découlant de l&apos;utilisation ou de
            l&apos;indisponibilité du service. Notre responsabilité maximale est limitée au
            montant payé sur les 12 derniers mois.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">8. Résiliation</h2>
          <p>
            Vous pouvez résilier votre compte à tout moment depuis l&apos;application
            (suppression du compte). Nous pouvons suspendre ou résilier votre compte
            en cas de violation grave de ces conditions, après notification.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">9. Modifications</h2>
          <p>
            Ces conditions peuvent être modifiées. Toute modification substantielle
            sera notifiée au moins 30 jours à l&apos;avance par email aux utilisateurs.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">10. Droit applicable</h2>
          <p>
            Les présentes conditions sont régies par le droit français. Tout litige relève
            de la compétence exclusive des tribunaux français.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">11. Contact</h2>
          <p>
            <a href="mailto:legal@timewin24.app" className="text-blue-600 underline">
              legal@timewin24.app
            </a>
            <br />
            Support utilisateur :{" "}
            <a href="/support" className="text-blue-600 underline">
              page support
            </a>.
          </p>
        </section>
      </main>
    </div>
  );
}
