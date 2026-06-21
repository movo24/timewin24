"use client";

// M115 — frontière d'erreur de l'app mobile inventaire.
import { useEffect } from "react";

export default function InventoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[inventory] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">⚠️</div>
      <h2 className="text-lg font-semibold text-gray-900">Une erreur est survenue</h2>
      <p className="max-w-xs text-sm text-gray-500">
        L&apos;écran n&apos;a pas pu se charger. Réessaie ; si ça continue, reconnecte-toi.
      </p>
      <button
        onClick={reset}
        className="w-full max-w-xs rounded-xl bg-gray-900 px-5 py-3 text-base font-semibold text-white active:bg-gray-700"
      >
        Réessayer
      </button>
    </div>
  );
}
