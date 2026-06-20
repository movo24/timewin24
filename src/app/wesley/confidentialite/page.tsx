import type { Metadata } from "next";
import { TrackPageView } from "@/components/wesley/track-page-view";

export const metadata: Metadata = {
  title: "Confidentialité & cookies — The Wesley",
  description: "Comment The Wesley utilise tes données et les cookies de mesure d’audience.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <TrackPageView path="/wesley/confidentialite" />
      <h1 className="text-3xl font-black">Confidentialité &amp; cookies</h1>
      <p className="mt-2 text-sm text-gray-500">Version V1 — à compléter par le service juridique.</p>

      <div className="prose mt-6 space-y-4 text-gray-700">
        <h2 className="text-xl font-bold">Mesure d’audience</h2>
        <p>
          On utilise des cookies de mesure d’audience pour comprendre quels produits t’intéressent
          et améliorer le site. Aucun traceur n’est déposé tant que tu n’as pas accepté via le
          bandeau de consentement.
        </p>

        <h2 className="text-xl font-bold">Tes données</h2>
        <p>
          Quand tu nous demandes The Wesley dans ta ville, on garde la ville (et ton email si tu le
          donnes) uniquement pour évaluer la demande d’ouverture et te prévenir. Tu peux demander
          l’accès, la correction ou la suppression de tes données.
        </p>

        <h2 className="text-xl font-bold">À compléter (V2)</h2>
        <ul className="list-disc pl-6">
          <li>CGV, mentions légales, politique de retour, livraison.</li>
          <li>CMP complète (catégories de cookies, logs de consentement, durées de conservation).</li>
          <li>Export / suppression RGPD en self-service depuis l’espace client.</li>
        </ul>
      </div>
    </div>
  );
}
