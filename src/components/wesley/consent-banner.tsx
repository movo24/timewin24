"use client";

import { useEffect, useState } from "react";

// Bandeau de consentement RGPD/CNIL minimal (V1).
// V2 : remplacer par une CMP complète (catégories, logs de consentement, durée).
// Tant que l’utilisateur n’a pas accepté, window.__wesleyConsent reste false
// et la couche analytics (analytics.ts) ne pousse aucun événement.

const KEY = "wesley_consent";

export function ConsentBanner() {
  const [decided, setDecided] = useState(true); // évite le flash avant hydratation

  useEffect(() => {
    // Lecture du consentement depuis localStorage au montage (sync depuis un système externe).
    const saved = localStorage.getItem(KEY);
    if (saved === "granted") window.__wesleyConsent = true;
    else if (saved === "denied") window.__wesleyConsent = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDecided(saved === "granted" || saved === "denied");
  }, []);

  function choose(granted: boolean) {
    localStorage.setItem(KEY, granted ? "granted" : "denied");
    window.__wesleyConsent = granted;
    setDecided(true);
  }

  if (decided) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-pink-200 bg-white/95 p-4 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-700">
          On utilise des cookies de mesure d’audience pour améliorer The Wesley. Tu peux
          accepter ou refuser — rien n’est suivi sans ton accord.{" "}
          <a href="/wesley/confidentialite" className="underline">
            En savoir plus
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => choose(false)}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refuser
          </button>
          <button
            onClick={() => choose(true)}
            className="rounded-full bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700"
          >
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
