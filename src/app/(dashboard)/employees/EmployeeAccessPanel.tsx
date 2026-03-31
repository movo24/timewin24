"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound, ShieldOff, ShieldCheck, RefreshCw, Copy, Eye, EyeOff,
  AlertTriangle, PauseCircle, CheckCircle2,
} from "lucide-react";
import { Employee } from "./types";

interface Props {
  employee: Employee & {
    employeeCode: string;
    accessStatus: "ACTIVE" | "BLOCKED" | "SUSPENDED";
    blockedAt: string | null;
    blockedReason: string | null;
    forceCodeChange: boolean;
    lastLoginAt: string | null;
    posPin: string | null; // hashed — never shown
  };
  onRefresh: () => void;
  setError: (e: string) => void;
}

const STATUS_CONFIG = {
  ACTIVE:    { label: "Actif",    variant: "success"   as const, icon: CheckCircle2 },
  BLOCKED:   { label: "Bloqué",  variant: "destructive" as const, icon: ShieldOff },
  SUSPENDED: { label: "Suspendu", variant: "warning"   as const, icon: PauseCircle },
};

export default function EmployeeAccessPanel({ employee, onRefresh, setError }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<"pin" | "code" | null>(null);

  async function callAccess(action: string, payload?: Record<string, string>) {
    setLoading(action);
    setError("");
    try {
      const res = await fetch(`/api/employees/${employee.id}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Erreur (${res.status})`); return null; }
      return data;
    } catch {
      setError("Erreur réseau");
      return null;
    } finally {
      setLoading(null);
    }
  }

  function copyToClipboard(text: string, type: "pin" | "code") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  const status = STATUS_CONFIG[employee.accessStatus] || STATUS_CONFIG.ACTIVE;
  const StatusIcon = status.icon;
  const hasPin = !!employee.posPin;

  return (
    <div className="border-t border-gray-200 pt-4 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-700">Accès terrain</span>
      </div>

      {/* Status + last login */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Statut accès</span>
          <Badge variant={status.variant} className="flex items-center gap-1 text-xs">
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Code employé</span>
          <div className="flex items-center gap-1.5">
            <code className="text-xs font-mono font-bold text-gray-900 bg-white border border-gray-200 rounded px-2 py-0.5">
              {generatedCode || employee.employeeCode}
            </code>
            {generatedCode && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(generatedCode, "code")}>
                {copied === "code" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">PIN</span>
          <span className={`text-xs font-medium ${hasPin || generatedPin ? "text-green-700" : "text-gray-400"}`}>
            {generatedPin ? (
              <span className="flex items-center gap-1">
                <code className="font-mono bg-green-50 border border-green-200 rounded px-2 py-0.5">{generatedPin}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(generatedPin, "pin")}>
                  {copied === "pin" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </span>
            ) : hasPin ? "Défini ●●●●" : "Non défini"}
          </span>
        </div>
        {employee.blockedReason && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{employee.blockedReason}</span>
          </div>
        )}
        {employee.forceCodeChange && (
          <div className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
            Changement de code forcé au prochain login
          </div>
        )}
        {employee.lastLoginAt && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Dernière connexion</span>
            <span className="text-xs text-gray-700">
              {new Date(employee.lastLoginAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      {/* Code employé — modifier ou générer */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-600">Modifier le code employé</Label>
        <div className="flex gap-2">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="Ex: 250781"
            className="flex-1 text-sm h-8"
            maxLength={20}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs shrink-0"
            disabled={!newCode.trim() || loading === "set-code"}
            onClick={async () => {
              const res = await callAccess("set-code", { value: newCode.trim() });
              if (res) { setGeneratedCode(res.employeeCode); setNewCode(""); onRefresh(); }
            }}
          >
            Appliquer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs shrink-0"
            disabled={loading === "generate-code"}
            onClick={async () => {
              const res = await callAccess("generate-code");
              if (res) { setGeneratedCode(res.employeeCode); onRefresh(); }
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading === "generate-code" ? "animate-spin" : ""}`} />
            Générer
          </Button>
        </div>
      </div>

      {/* PIN — modifier ou générer */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-600">Modifier le PIN (4-6 chiffres)</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="\d{4,6}"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="●●●●"
              className="text-sm h-8 pr-8"
              maxLength={6}
            />
            <button type="button" onClick={() => setShowPin(!showPin)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs shrink-0"
            disabled={newPin.length < 4 || loading === "set-pin"}
            onClick={async () => {
              const res = await callAccess("set-pin", { value: newPin });
              if (res) { setNewPin(""); onRefresh(); }
            }}
          >
            Appliquer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs shrink-0"
            disabled={loading === "generate-pin"}
            onClick={async () => {
              const res = await callAccess("generate-pin");
              if (res) { setGeneratedPin(res.pin); onRefresh(); }
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading === "generate-pin" ? "animate-spin" : ""}`} />
            Générer
          </Button>
        </div>
        {generatedPin && (
          <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
            Communiquez ce PIN à l&apos;employé. Il ne sera plus visible après fermeture.
          </p>
        )}
      </div>

      {/* Actions bloc / déblocage */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-600">Contrôle d&apos;accès</Label>
        <div className="space-y-2">
          {employee.accessStatus !== "ACTIVE" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs text-green-700 border-green-300 hover:bg-green-50"
              disabled={loading === "unblock"}
              onClick={async () => {
                const res = await callAccess("unblock");
                if (res) onRefresh();
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Débloquer / Réactiver l&apos;accès
            </Button>
          ) : (
            <>
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Motif (optionnel)"
                className="text-sm h-8"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                  disabled={loading === "suspend"}
                  onClick={async () => {
                    const res = await callAccess("suspend", { reason: blockReason });
                    if (res) { setBlockReason(""); onRefresh(); }
                  }}
                >
                  <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
                  Suspendre
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs text-red-700 border-red-300 hover:bg-red-50"
                  disabled={loading === "block"}
                  onClick={async () => {
                    const res = await callAccess("block", { reason: blockReason });
                    if (res) { setBlockReason(""); onRefresh(); }
                  }}
                >
                  <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                  Bloquer
                </Button>
              </div>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`w-full text-xs ${employee.forceCodeChange ? "text-blue-700 bg-blue-50" : "text-gray-600"}`}
            disabled={loading === "force-code-change"}
            onClick={async () => {
              const res = await callAccess("force-code-change");
              if (res) onRefresh();
            }}
          >
            {employee.forceCodeChange ? "Annuler le changement de code forcé" : "Forcer changement de code au prochain login"}
          </Button>
        </div>
      </div>
    </div>
  );
}
