/**
 * Orchestration Payroll Inputs (pure) : assemble les adaptateurs source +
 * l'agrégateur pour produire, à partir de lignes brutes déjà chargées, les
 * variables de paie + la ligne d'export. Aucune lecture/écriture DB ici,
 * aucune valorisation. Réutilisable par un endpoint (lecture) ou la
 * persistance future (Tier-2).
 */
import type { PayrollKey, PayrollInputVariables } from "./types";
import { workedFactsFromClockIns, latenessFromClockIns, absenceFactsFromDeclarations } from "./source";
import type { ClockInRow, AbsenceRow } from "./source";
import { aggregatePayrollInputs } from "./aggregate";
import { toExportRow } from "./export";
import type { PayrollExportRow } from "./export";

export interface PayrollPreviewInput {
  key: PayrollKey;
  contractWeeklyHours: number;
  clockIns: ClockInRow[];
  absences: AbsenceRow[];
}

export interface PayrollPreview {
  key: PayrollKey;
  variables: PayrollInputVariables;
  exportRow: PayrollExportRow;
}

/** Construit l'aperçu des variables de paie (quantités) pour un contrat × période. */
export function buildPayrollPreview(input: PayrollPreviewInput): PayrollPreview {
  const worked = workedFactsFromClockIns(input.clockIns);
  const lateness = latenessFromClockIns(input.clockIns);
  const absences = absenceFactsFromDeclarations(input.absences);

  const variables = aggregatePayrollInputs({
    contractWeeklyHours: input.contractWeeklyHours,
    worked,
    absences,
    lateness,
  });

  return { key: input.key, variables, exportRow: toExportRow(input.key, variables) };
}
