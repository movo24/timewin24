"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(result.error);
    } else {
      const sessionRes = await fetch("/api/auth/session");
      const sessionData = await sessionRes.json();

      if (sessionData?.user?.mustChangePassword) {
        router.push("/changer-mot-de-passe");
        return;
      }

      // Vérifier que c'est bien un admin ou manager
      const role = sessionData?.user?.role;
      if (role === "EMPLOYEE") {
        // Un employé ne devrait pas se connecter ici
        setError("Acc\u00e8s r\u00e9serv\u00e9 aux administrateurs. Utilisez la page de connexion employ\u00e9s.");
        // Déconnecter
        await fetch("/api/auth/signout", { method: "POST" });
        setLoading(false);
        return;
      }

      router.push("/planning");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-8">
          {/* Logo & titre */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500 rounded-xl mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">Administration</h1>
            <p className="text-sm text-gray-400 mt-1">
              TimeWin &mdash; Espace administrateur
            </p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-300">
                Email administrateur
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@entreprise.fr"
                required
                autoComplete="email"
                className="h-11 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-amber-500 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-300">
                Mot de passe
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                required
                autoComplete="current-password"
                className="h-11 bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-amber-500 focus:ring-amber-500"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-lg p-3">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-gray-900 font-semibold rounded-lg"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  V&eacute;rification...
                </span>
              ) : (
                "Connexion administrateur"
              )}
            </Button>
          </form>

          {/* Lien retour */}
          <div className="mt-8 pt-4 border-t border-gray-700 text-center">
            <Link
              href="/login"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              &#8592; Retour &agrave; la connexion employ&eacute;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
