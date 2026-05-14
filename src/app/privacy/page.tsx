/**
 * /privacy — Privacy Policy page
 *
 * Required by Apple App Store guidelines (App Tracking + GDPR + CCPA).
 * Public route — no authentication required.
 *
 * Reviewed for: TimeWin24 SaaS App Store variant.
 * Last updated: 2026-05.
 */
export const metadata = {
  title: "Politique de confidentialité — TimeWin24",
  description: "Comment TimeWin24 traite vos données personnelles.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-gray-500 mb-8">Dernière mise à jour : mai 2026</p>

        <section className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <h2 className="text-xl font-semibold text-gray-900">1. Qui sommes-nous ?</h2>
          <p>
            TimeWin24 est une plateforme SaaS de gestion du temps de travail destinée
            aux entreprises (gestion des plannings, employés, sites, pointages).
            La société TimeWin24 (ci-après « nous ») est responsable du traitement
            des données collectées via cette application.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">2. Données que nous collectons</h2>
          <p>
            Nous collectons uniquement les données strictement nécessaires au fonctionnement
            du service :
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Compte utilisateur</strong> : nom, email, mot de passe (haché), rôle.</li>
            <li><strong>Profil employé</strong> : prénom, nom, email professionnel, téléphone (optionnel), heures contractuelles, compétences.</li>
            <li><strong>Données opérationnelles</strong> : shifts, pointages (avec photo et géolocalisation si activé), absences, messages internes RH.</li>
            <li><strong>Audit</strong> : trace des actions sensibles (qui a modifié quoi, quand) — conservée 13 mois maximum.</li>
            <li><strong>Métadonnées techniques</strong> : adresse IP de connexion (audit login), user-agent du navigateur.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900">3. Pourquoi nous collectons ces données</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Pour vous permettre de vous connecter et d&apos;utiliser le service.</li>
            <li>Pour permettre à votre employeur de gérer vos plannings et vos pointages.</li>
            <li>Pour répondre à nos obligations légales (audit, RGPD, droit du travail).</li>
            <li>Pour améliorer la sécurité du service (détection de connexions anormales).</li>
          </ul>
          <p>
            <strong>Nous ne vendons jamais vos données.</strong> Nous ne les utilisons jamais à des fins
            publicitaires. Nous ne les partageons avec aucun tiers à des fins commerciales.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">4. Vos droits</h2>
          <p>Conformément au RGPD, vous disposez des droits suivants :</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Accès</strong> : consulter les données que nous avons sur vous.</li>
            <li><strong>Rectification</strong> : corriger des données inexactes.</li>
            <li><strong>Suppression</strong> : effacer votre compte (
              <a href="/account/delete" className="text-blue-600 underline">/account/delete</a>{" "}
              dans l&apos;application). Les données opérationnelles (shifts passés, audit légal)
              peuvent être conservées par votre employeur pour des raisons légales.
            </li>
            <li><strong>Portabilité</strong> : exporter vos données dans un format machine-lisible.</li>
            <li><strong>Opposition</strong> : refuser certains traitements.</li>
          </ul>
          <p>
            Pour exercer ces droits, contactez-nous à l&apos;adresse{" "}
            <a href="mailto:privacy@timewin24.app" className="text-blue-600 underline">
              privacy@timewin24.app
            </a>.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">5. Sécurité</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Mots de passe stockés hachés (bcrypt) — jamais en clair.</li>
            <li>Connexions HTTPS uniquement (TLS).</li>
            <li>Verrouillage automatique du compte après 5 tentatives de connexion erronées.</li>
            <li>Isolation stricte multi-tenant : aucune Company ne peut accéder aux données d&apos;une autre.</li>
            <li>Hébergement européen (AWS Frankfurt) — vos données ne quittent pas l&apos;UE.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900">6. Sous-traitants</h2>
          <p>Nous utilisons les sous-traitants suivants pour faire fonctionner le service :</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Neon</strong> (PostgreSQL hébergement) — données stockées dans l&apos;UE.</li>
            <li><strong>Vercel</strong> (hébergement application) — région UE.</li>
            <li><strong>Resend</strong> (envoi des emails de planning) — traitement contractuellement encadré.</li>
          </ul>
          <p>
            Aucun de ces prestataires n&apos;est autorisé à utiliser vos données pour des fins
            propres.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">7. Durée de conservation</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Compte actif : tant que vous utilisez le service.</li>
            <li>Compte supprimé : 30 jours (soft-delete) puis purge définitive.</li>
            <li>Logs d&apos;audit : 13 mois maximum.</li>
            <li>Données légales (shifts passés, paie) : selon la durée légale exigée par votre pays.</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900">8. Contact</h2>
          <p>
            Pour toute question concernant cette politique :{" "}
            <a href="mailto:privacy@timewin24.app" className="text-blue-600 underline">
              privacy@timewin24.app
            </a>
            <br />
            Pour le support :{" "}
            <a href="/support" className="text-blue-600 underline">
              page support
            </a>.
          </p>
        </section>
      </main>
    </div>
  );
}
