"use client";

import type { ScoreBreakdown } from "@/lib/reliability-score";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { BarChart3, KeyRound, Eye, EyeOff, Copy, CheckCircle2 } from "lucide-react";
import { ScoreBreakdownPanel } from "@/components/reliability-score";
import EmployeeForm from "./EmployeeForm";
import { Employee, FormState, StoreOption } from "./types";

interface Props {
  // Main dialog
  dialogOpen: boolean;
  setDialogOpen: (v: boolean) => void;
  editing: Employee | null;
  setEditing: (emp: Employee) => void;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  allStores: StoreOption[];
  storesLoading: boolean;
  storesError: boolean;
  error: string;
  setError: (e: string) => void;
  loading: boolean;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  formCostPerHour: number | null;
  onSubmit: (e: React.FormEvent) => void;
  onToggleSkill: (skill: string) => void;
  onToggleStore: (storeId: string) => void;
  generatePassword: () => string;
  loadEmployees: () => void;
  // Score dialog
  scoreDialogOpen: boolean;
  setScoreDialogOpen: (v: boolean) => void;
  scoreLoading: boolean;
  scoreBreakdown: ScoreBreakdown | null;
  scoreEmployee: { firstName: string; lastName: string } | null;
  // Password success dialog (managed by parent)
  passwordSuccessOpen: boolean;
  setPasswordSuccessOpen: (v: boolean) => void;
  passwordSuccessValue: string;
  passwordSuccessName: string;
  passwordSuccessMode: "create" | "reset";
  passwordCopied: boolean;
  setPasswordCopied: (v: boolean) => void;
  onPasswordSuccess: (password: string, name: string, mode: "create" | "reset") => void;
}

export default function EmployeeModal({
  dialogOpen, setDialogOpen, editing, setEditing,
  form, setForm, allStores, storesLoading, storesError,
  error, setError, loading, showPassword, setShowPassword,
  formCostPerHour, onSubmit, onToggleSkill, onToggleStore,
  generatePassword, loadEmployees,
  scoreDialogOpen, setScoreDialogOpen, scoreLoading, scoreBreakdown, scoreEmployee,
  passwordSuccessOpen, setPasswordSuccessOpen,
  passwordSuccessValue, passwordSuccessName, passwordSuccessMode,
  passwordCopied, setPasswordCopied, onPasswordSuccess,
}: Props) {
  // Reset password state (local — self-contained)
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordEmployeeId, setResetPasswordEmployeeId] = useState<string | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  function handleResetPasswordClick() {
    if (!editing) return;
    setResetPasswordEmployeeId(editing.id);
    setResetPasswordValue(generatePassword());
    setShowResetPassword(true);
    setResetPasswordOpen(true);
  }

  return (
    <>
      {/* Main employee form dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg mx-2 sm:mx-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'employé" : "Nouvel employé"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifiez les informations et les coûts de l'employé."
                : "Ajoutez un nouvel employé avec ses paramètres de coût."}
            </DialogDescription>
          </DialogHeader>
          <EmployeeForm
            form={form}
            setForm={setForm}
            editing={editing}
            setEditing={setEditing}
            allStores={allStores}
            storesLoading={storesLoading}
            storesError={storesError}
            error={error}
            setError={setError}
            loading={loading}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            formCostPerHour={formCostPerHour}
            onSubmit={onSubmit}
            onCancel={() => setDialogOpen(false)}
            onResetPasswordClick={handleResetPasswordClick}
            onToggleSkill={onToggleSkill}
            onToggleStore={onToggleStore}
            generatePassword={generatePassword}
            loadEmployees={loadEmployees}
          />
        </DialogContent>
      </Dialog>

      {/* Score detail dialog */}
      <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
        <DialogContent className="max-w-sm mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Score de fiabilité
            </DialogTitle>
            <DialogDescription>
              {scoreEmployee
                ? `${scoreEmployee.firstName} ${scoreEmployee.lastName} — 30 derniers jours`
                : "Chargement..."}
            </DialogDescription>
          </DialogHeader>
          {scoreLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-3 border-gray-400 border-t-transparent rounded-full" />
            </div>
          ) : scoreBreakdown ? (
            <ScoreBreakdownPanel breakdown={scoreBreakdown} />
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              Aucune donnée disponible. Cliquez sur &quot;Scores fiabilité&quot; pour calculer.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="max-w-sm mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Réinitialiser le mot de passe
            </DialogTitle>
            <DialogDescription>
              L&apos;employé devra changer ce mot de passe à sa prochaine connexion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nouveau mot de passe</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showResetPassword ? "text" : "password"}
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    minLength={6}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" className="shrink-0" title="Copier"
                  onClick={() => navigator.clipboard.writeText(resetPasswordValue)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs"
                  onClick={() => setResetPasswordValue(generatePassword())}>
                  Générer
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResetPasswordOpen(false)}>Annuler</Button>
              <Button
                type="button"
                disabled={resetPasswordLoading || resetPasswordValue.length < 6}
                onClick={async () => {
                  if (!resetPasswordEmployeeId) return;
                  setResetPasswordLoading(true);
                  try {
                    const res = await fetch(`/api/employees/${resetPasswordEmployeeId}/reset-password`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ newPassword: resetPasswordValue }),
                    });
                    if (res.ok) {
                      setResetPasswordOpen(false);
                      const empName = editing ? `${editing.firstName} ${editing.lastName}` : "l'employé";
                      onPasswordSuccess(resetPasswordValue, empName, "reset");
                    } else {
                      const data = await res.json().catch(() => ({}));
                      setError(data.error || "Erreur lors de la réinitialisation");
                    }
                  } catch {
                    setError("Erreur réseau");
                  }
                  setResetPasswordLoading(false);
                }}
              >
                {resetPasswordLoading ? "..." : "Réinitialiser"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password success dialog (creation) */}
      <Dialog open={passwordSuccessOpen} onOpenChange={setPasswordSuccessOpen}>
        <DialogContent className="max-w-sm mx-2 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              {passwordSuccessMode === "create" ? "Employé créé avec succès" : "Mot de passe réinitialisé"}
            </DialogTitle>
            <DialogDescription>
              {passwordSuccessMode === "create"
                ? `Le compte de ${passwordSuccessName} a été créé.`
                : `Le mot de passe de ${passwordSuccessName} a été réinitialisé.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-800">Mot de passe à communiquer :</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-lg font-mono font-bold text-gray-900 bg-white rounded px-3 py-2 border border-amber-200 select-all text-center tracking-wider">
                  {passwordSuccessValue}
                </code>
                <Button type="button" variant="outline" size="icon"
                  className={`shrink-0 ${passwordCopied ? "border-green-400 text-green-600" : ""}`}
                  title="Copier le mot de passe"
                  onClick={() => {
                    navigator.clipboard.writeText(passwordSuccessValue);
                    setPasswordCopied(true);
                    setTimeout(() => setPasswordCopied(false), 2000);
                  }}>
                  {passwordCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-amber-700">
                Ce mot de passe ne sera plus affiché après fermeture. L&apos;employé devra le changer à sa première connexion.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setPasswordSuccessOpen(false)}>Compris</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
