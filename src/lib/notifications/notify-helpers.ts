/**
 * Pure helpers for the planning notification API.
 * Extracted so they can be unit-tested without the Next.js / Prisma stack.
 */

export type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "EMPLOYEE";

export interface RbacInput {
  role: Role;
  /** null = full access (admin); array = whitelisted store ids */
  accessibleStoreIds: string[] | null;
  /** Store id requested in the API call. Empty/undefined = "all stores". */
  requestedStoreId?: string;
}

export type RbacOutcome =
  | { ok: true }
  | { ok: false; status: 403; reason: string };

/**
 * Apply RBAC to a planning notify/notifications request.
 *
 * Rules:
 *   - ADMIN / SUPER_ADMIN → unrestricted
 *   - EMPLOYEE → blocked (handled before this — but defensive)
 *   - MANAGER → must specify a storeId AND it must be in their accessible list
 */
export function applyNotifyRbac(input: RbacInput): RbacOutcome {
  const { role, accessibleStoreIds, requestedStoreId } = input;

  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    return { ok: true };
  }

  if (role === "EMPLOYEE") {
    return {
      ok: false,
      status: 403,
      reason: "Accès refusé : vous n'êtes pas autorisé à envoyer des plannings",
    };
  }

  // MANAGER from here
  if (!requestedStoreId) {
    return {
      ok: false,
      status: 403,
      reason: "Vous devez spécifier un magasin",
    };
  }

  if (
    accessibleStoreIds !== null &&
    !accessibleStoreIds.includes(requestedStoreId)
  ) {
    return {
      ok: false,
      status: 403,
      reason: "Accès refusé : magasin hors périmètre",
    };
  }

  return { ok: true };
}

// ─── Batching ────────────────────────────────────────────────────────────

/** Split an array into chunks of given size (last chunk may be smaller). */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Predict the batching plan without actually sending.
 * Used to verify that 60-employee scenarios will be split correctly.
 */
export function planBatches(
  totalCount: number,
  batchSize: number,
  pauseMs: number
): { batches: number; lastBatchSize: number; totalPauseMs: number } {
  if (totalCount === 0) {
    return { batches: 0, lastBatchSize: 0, totalPauseMs: 0 };
  }
  const batches = Math.ceil(totalCount / batchSize);
  const lastBatchSize =
    totalCount % batchSize === 0 ? batchSize : totalCount % batchSize;
  // Pause is between batches → (batches - 1) pauses
  const totalPauseMs = Math.max(0, batches - 1) * pauseMs;
  return { batches, lastBatchSize, totalPauseMs };
}

// ─── Result aggregation ──────────────────────────────────────────────────

export type SendResultStatus = "sent" | "failed" | "no_email" | "preview";

export interface SendResultLike {
  status: SendResultStatus;
}

/**
 * Aggregate per-employee send results into a summary.
 * Used to ensure the response is always clear: sent / failed / noEmail.
 */
export function summarizeSendResults<T extends SendResultLike>(
  results: T[]
): { sent: number; failed: number; noEmail: number; partial: boolean } {
  let sent = 0;
  let failed = 0;
  let noEmail = 0;
  for (const r of results) {
    if (r.status === "sent") sent++;
    else if (r.status === "failed") failed++;
    else if (r.status === "no_email") noEmail++;
  }
  // partial = at least one success AND at least one non-success outcome
  const partial = sent > 0 && (failed > 0 || noEmail > 0);
  return { sent, failed, noEmail, partial };
}
