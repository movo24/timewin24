"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OnboardingDonePage() {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");

  async function handleComplete() {
    setCompleting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la finalisation");
        setCompleting(false);
        return;
      }
      // Redirection vers le dashboard
      router.push("/dashboard");
    } catch {
      setError("Erreur réseau");
      setCompleting(false);
    }
  }

  return (
    <div className="space-y-8 text-center">
      <div className="flex justify-center">
        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Tout est prêt !
        </h1>
        <p className="text-gray-500 max-w-md mx-auto">
          Votre société, votre premier site et votre premier employé sont configurés.
          Vous pouvez maintenant créer vos plannings.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 text-left max-w-md mx-auto">
        <h2 className="font-semibold text-gray-900 mb-3">
          Quelques pistes pour démarrer
        </h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">•</span>
            Allez dans <strong>Planning</strong> et cliquez sur <strong>&quot;Auto-planifier&quot;</strong> pour générer un planning intelligent.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">•</span>
            Ajoutez d&apos;autres employés depuis <strong>Employés</strong>.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">•</span>
            Envoyez le planning par email à vos employés en un clic depuis le calendrier.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold">•</span>
            Suivez les pointages et absences en temps réel.
          </li>
        </ul>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 max-w-md mx-auto">
          {error}
        </p>
      )}

      <div className="flex justify-center">
        <Button onClick={handleComplete} disabled={completing} size="lg">
          {completing ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Finalisation…</>
          ) : (
            <>Aller au dashboard<ArrowRight className="h-4 w-4 ml-1.5" /></>
          )}
        </Button>
      </div>
    </div>
  );
}
