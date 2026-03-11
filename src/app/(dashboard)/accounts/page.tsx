"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Shield,
  UserX,
  UserCheck,
  Trash2,
  Clock,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";

interface Account {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  active: boolean;
  lastLoginAt: string | null;
  loginCount: number;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    active: boolean;
    contractType: string | null;
    stores: { store: { id: string; name: string } }[];
  } | null;
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  user: { id: string } | null;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  ADMIN: { label: "Admin", color: "bg-red-100 text-red-700 border-red-200" },
  MANAGER: {
    label: "Manager",
    color: "bg-amber-100 text-amber-700 border-amber-200",
  },
  EMPLOYEE: {
    label: "Employé",
    color: "bg-blue-100 text-blue-700 border-blue-200",
  },
};

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pw = "";
  for (let i = 0; i < 10; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"EMPLOYEE" | "MANAGER">("EMPLOYEE");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Reset password dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetAccount, setResetAccount] = useState<Account | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const loadAccounts = useCallback(async () => {
    const res = await fetch(
      `/api/accounts?page=${page}&limit=20&search=${encodeURIComponent(search)}`
    );
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts);
      setTotalPages(data.pagination.totalPages);
    }
  }, [page, search]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Load employees without accounts for create dialog
  async function loadEmployeesWithoutAccount() {
    const res = await fetch("/api/employees?limit=200&active=true");
    if (res.ok) {
      const data = await res.json();
      // Filter employees that don't have a user account yet
      const withoutAccount = (data.employees || []).filter(
        (e: EmployeeOption) => !e.user
      );
      setEmployees(withoutAccount);
    }
  }

  function openCreate() {
    setSelectedEmployeeId("");
    setNewPassword(generatePassword());
    setNewRole("EMPLOYEE");
    setShowPassword(true);
    setCopied(false);
    setCreateError("");
    loadEmployeesWithoutAccount();
    setCreateOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId || !newPassword) return;

    setCreateLoading(true);
    setCreateError("");

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: selectedEmployeeId,
        password: newPassword,
        role: newRole,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setCreateError(data.error || "Erreur");
      setCreateLoading(false);
      return;
    }

    setCreateLoading(false);
    setCreateOpen(false);
    loadAccounts();
  }

  function openResetPassword(account: Account) {
    setResetAccount(account);
    setResetPassword(generatePassword());
    setShowPassword(true);
    setCopied(false);
    setResetOpen(true);
  }

  async function handleResetPassword() {
    if (!resetAccount || !resetPassword) return;
    setResetLoading(true);

    const res = await fetch(
      `/api/accounts/${resetAccount.id}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPassword }),
      }
    );

    setResetLoading(false);
    if (res.ok) {
      setResetOpen(false);
      loadAccounts();
    }
  }

  async function toggleAccount(account: Account) {
    const action = account.active ? "désactiver" : "réactiver";
    if (!confirm(`Voulez-vous ${action} le compte de ${account.name} ?`))
      return;

    await fetch(`/api/accounts/${account.id}/toggle`, { method: "POST" });
    loadAccounts();
  }

  async function changeRole(account: Account, newRole: string) {
    await fetch(`/api/accounts/${account.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    loadAccounts();
  }

  async function deleteAccount(account: Account) {
    if (
      !confirm(
        `Supprimer le compte de ${account.name} ?\nL'employé sera conservé, seul l'accès sera supprimé.`
      )
    )
      return;

    await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    loadAccounts();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Comptes utilisateurs
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestion des accès employés et managers
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Nouveau compte</span>
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Rechercher par nom, email, code employé..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Accounts list */}
      <div className="space-y-2">
        {accounts.map((account) => {
          const roleInfo = ROLE_LABELS[account.role] || ROLE_LABELS.EMPLOYEE;
          const isLocked =
            account.lockedUntil && new Date(account.lockedUntil) > new Date();

          return (
            <div
              key={account.id}
              className={`bg-white border rounded-lg p-3 sm:p-4 ${
                !account.active
                  ? "border-gray-200 opacity-60"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">
                      {account.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${roleInfo.color}`}
                    >
                      {roleInfo.label}
                    </Badge>
                    {!account.active && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-gray-100 text-gray-500"
                      >
                        Désactivé
                      </Badge>
                    )}
                    {isLocked && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-red-100 text-red-600"
                      >
                        Verrouillé
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {account.email}
                  </p>
                  {account.employee && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                        {account.employee.employeeCode.slice(0, 8)}
                      </span>
                      {account.employee.stores.map((s) => (
                        <span key={s.store.id}>{s.store.name}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {account.role !== "ADMIN" && (
                    <select
                      value={account.role}
                      onChange={(e) => changeRole(account, e.target.value)}
                      className="h-7 text-xs border border-gray-200 rounded px-1.5 bg-white"
                    >
                      <option value="EMPLOYEE">Employé</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Réinitialiser mot de passe"
                    onClick={() => openResetPassword(account)}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={account.active ? "Désactiver" : "Réactiver"}
                    onClick={() => toggleAccount(account)}
                  >
                    {account.active ? (
                      <UserX className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <UserCheck className="h-3.5 w-3.5 text-green-500" />
                    )}
                  </Button>
                  {account.role !== "ADMIN" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Supprimer le compte"
                      onClick={() => deleteAccount(account)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Login stats */}
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {account.lastLoginAt
                    ? `Dernière connexion: ${new Date(
                        account.lastLoginAt
                      ).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Jamais connecté"}
                </span>
                <span>{account.loginCount} connexion(s)</span>
                {account.failedAttempts > 0 && (
                  <span className="text-amber-500">
                    {account.failedAttempts} tentative(s) échouée(s)
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            <Shield className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p>Aucun compte trouvé</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Create account dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer un compte</DialogTitle>
            <DialogDescription>
              Créez un accès pour qu&apos;un employé puisse consulter son
              planning.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Employé *</Label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
                required
              >
                <option value="">Sélectionner un employé...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} — {emp.email}
                  </option>
                ))}
              </select>
              {employees.length === 0 && (
                <p className="text-xs text-gray-400">
                  Tous les employés actifs ont déjà un compte.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Rôle</Label>
              <select
                value={newRole}
                onChange={(e) =>
                  setNewRole(e.target.value as "EMPLOYEE" | "MANAGER")
                }
                className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="EMPLOYEE">Employé (lecture seule)</option>
                <option value="MANAGER">Manager (édition planning)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Mot de passe initial</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-16 font-mono"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => copyToClipboard(newPassword)}
                  title="Copier"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => setNewPassword(generatePassword())}
                >
                  Générer
                </Button>
              </div>
              <p className="text-[10px] text-gray-400">
                Communiquez ce mot de passe à l&apos;employé. Il pourra se
                connecter avec son email.
              </p>
            </div>

            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Création..." : "Créer le compte"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              {resetAccount
                ? `Nouveau mot de passe pour ${resetAccount.name}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nouveau mot de passe</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="pr-16 font-mono"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => copyToClipboard(resetPassword)}
                  title="Copier"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-gray-400">
                Communiquez ce nouveau mot de passe à l&apos;employé.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleResetPassword} disabled={resetLoading}>
                {resetLoading ? "..." : "Réinitialiser"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
