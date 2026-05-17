"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  userEmail: string;
  userName: string;
  userRole: string;
}

export function AccountDeleteForm({ userEmail, userName, userRole }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const EXPECTED = "SUPPRIMER";
  const canSubmit =
    password.length >= 1 && confirmText === EXPECTED && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          password,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la suppression");
        setSubmitting(false);
        return;
      }
      setSuccess(data.message ?? "Compte supprimé");
      // Logout puis redirect après 3 secondes
      setTimeout(async () => {
        await signOut({ redirect: false });
        router.push("/login");
      }, 3000);
    } catch {
      setError("Erreur réseau");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <h2 className="font-semibold text-green-900 mb-2">Compte supprimé</h2>
        <p className="text-sm text-green-800 mb-4">{success}</p>
        <p className="text-xs text-green-600">Redirection vers la page de connexion…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <div className="text-sm text-gray-500">
        Compte concerné : <strong className="text-gray-900">{userEmail}</strong>{" "}
        <span className="text-gray-400">({userName} — {userRole})</span>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          Pourquoi supprimez-vous votre compte ? <span className="text-gray-400">(optionnel)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Aide-nous à améliorer le service…"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          Mot de passe <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          autoComplete="current-password"
          required
        />
        <p className="text-xs text-gray-400">
          Confirme que c&apos;est bien toi qui demandes la suppression.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">
          Tape <code className="bg-gray-100 px-1.5 py-0.5 rounded text-red-700 font-mono">{EXPECTED}</code>{" "}
          pour confirmer <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-red-400 font-mono"
          autoComplete="off"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          disabled={!canSubmit}
          className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300"
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Suppression…</>
          ) : (
            <><Trash2 className="h-4 w-4 mr-1.5" />Supprimer mon compte</>
          )}
        </Button>
      </div>
    </form>
  );
}
