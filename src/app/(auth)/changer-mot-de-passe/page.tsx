"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, Check } from "lucide-react";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validation rules
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isDifferent = currentPassword !== newPassword && newPassword.length > 0;
  const allValid = hasMinLength && hasUppercase && hasNumber && passwordsMatch && isDifferent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/me/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors du changement de mot de passe");
        setLoading(false);
        return;
      }

      setSuccess(true);
      // Rediriger vers le login après 2 secondes pour que la session se rafraîchisse
      setTimeout(() => {
        signOut({ callbackUrl: "/login" });
      }, 2000);
    } catch {
      setError("Erreur réseau");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Mot de passe modifié !</h2>
          <p className="text-sm text-gray-500">
            Vous allez être redirigé vers la page de connexion...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
              <Lock className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Changement de mot de passe
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Pour la sécurité de votre compte, veuillez définir un nouveau mot de passe.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Mot de passe actuel</Label>
              <div className="relative">
                <Input
                  id="current"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Votre mot de passe temporaire"
                  required
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer z-10"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  tabIndex={-1}
                  aria-label={showCurrentPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4 pointer-events-none" /> : <Eye className="h-4 w-4 pointer-events-none" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="new"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 caractères"
                  required
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer z-10"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  tabIndex={-1}
                  aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4 pointer-events-none" /> : <Eye className="h-4 w-4 pointer-events-none" />}
                </button>
              </div>

              {/* Validation rules */}
              {newPassword.length > 0 && (
                <div className="space-y-1 mt-2">
                  <Rule ok={hasMinLength}>Au moins 8 caractères</Rule>
                  <Rule ok={hasUppercase}>Au moins une majuscule</Rule>
                  <Rule ok={hasNumber}>Au moins un chiffre</Rule>
                  <Rule ok={isDifferent}>Différent de l&apos;ancien</Rule>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="confirm"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retapez le mot de passe"
                  required
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer z-10"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4 pointer-events-none" /> : <Eye className="h-4 w-4 pointer-events-none" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || !allValid}>
              {loading ? "Modification..." : "Modifier mon mot de passe"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600" : "text-gray-400"}`}>
      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${ok ? "bg-green-100" : "bg-gray-100"}`}>
        {ok ? <Check className="h-2.5 w-2.5" /> : <span className="w-1 h-1 rounded-full bg-gray-300" />}
      </div>
      {children}
    </div>
  );
}
