/**
 * Export abstrait des variables de paie (Étage 3 — partie Tier-1).
 *
 * FRONTIÈRE : sérialise des QUANTITÉS qualifiées. Aucun montant, aucun mapping
 * vers un format éditeur concret (Silae/Sage/Cegid/PayFit/ADP…) — ce choix est
 * une décision produit **Tier-2**. On livre ici un format **abstrait, stable et
 * importable génériquement** (CSV / JSON) + un checksum pour l'audit.
 */
import crypto from "crypto";
import type { PayrollInputVariables, PayrollKey } from "./types";

/** Colonnes abstraites, ordre stable (contrat d'export). */
export const PAYROLL_EXPORT_COLUMNS = [
  "companySiren",
  "establishmentSiret",
  "contractId",
  "period",
  "totalWorkedHours",
  "normalHours",
  "overtimeHours",
  "complementaryHours",
  "sundayHours",
  "holidayHours",
  "paidLeaveDays",
  "sickOrAccidentDays",
  "otherAbsenceDays",
  "latenessMinutes",
] as const;

export type PayrollExportRow = Record<(typeof PAYROLL_EXPORT_COLUMNS)[number], string | number>;

/** Construit la ligne d'export abstraite (quantités) pour un contrat × période. */
export function toExportRow(key: PayrollKey, v: PayrollInputVariables): PayrollExportRow {
  return {
    companySiren: key.companySiren ?? "",
    establishmentSiret: key.establishmentSiret ?? "",
    contractId: key.contractId,
    period: key.period,
    totalWorkedHours: v.totalWorkedHours,
    normalHours: v.normalHours,
    overtimeHours: v.overtimeHours,
    complementaryHours: v.complementaryHours,
    sundayHours: v.sundayHours,
    holidayHours: v.holidayHours,
    paidLeaveDays: v.paidLeaveDays,
    sickOrAccidentDays: v.sickOrAccidentDays,
    otherAbsenceDays: v.otherAbsenceDays,
    latenessMinutes: v.latenessMinutes,
  };
}

/** Échappe une cellule CSV (RFC 4180 : guillemets si , " ou saut de ligne). */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sérialise des lignes d'export en CSV (en-tête + données). */
export function toCsv(rows: PayrollExportRow[]): string {
  const header = PAYROLL_EXPORT_COLUMNS.join(",");
  const body = rows.map((r) => PAYROLL_EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return [header, ...body].join("\n");
}

/** Sérialise des lignes d'export en JSON stable (clés ordonnées). */
export function toJsonExport(rows: PayrollExportRow[]): string {
  const ordered = rows.map((r) => {
    const o: Record<string, string | number> = {};
    for (const c of PAYROLL_EXPORT_COLUMNS) o[c] = r[c];
    return o;
  });
  return JSON.stringify(ordered);
}

/**
 * Checksum SHA-256 (hex) du contenu d'export — pour le journal d'audit et la
 * détection de réexport divergent. Déterministe sur le contenu.
 */
export function exportChecksum(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}
