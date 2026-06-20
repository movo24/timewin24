"use client";

// M115 — frontière d'erreur du groupe (employee).
import { useEffect } from "react";

export default function EmployeeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[employee] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-xl font-semibold text-gray-900">Une erreur est survenue</h2>
      <p className="max-w-md text-sm text-gray-500">
        Cette page n&apos;a pas pu se charger. Réessaie dans un instant.
      </p>
      <button
        onClick={reset}
        className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700"
      >
        Réessayer
      </button>
    </div>
  );
}
