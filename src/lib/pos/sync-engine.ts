// ─── POS Sync Engine ───────────────────────────────
// Orchestre la synchronisation entre TimeWin et un POS.
// Utilise l'adaptateur approprié via la factory.

import { prisma } from "@/lib/prisma";
import { createPosAdapter } from "./factory";
import type { PosAdapter } from "./adapter";
import type { PosProviderConfig, PosSyncResult, PosDateRange, PosSyncError } from "./types";

type SyncEntity = "employees" | "timeclock" | "sales" | "stores";
type SyncDirection = "PUSH" | "PULL" | "BOTH";

/**
 * Lance une synchronisation pour un provider donné.
 */
export async function runSync(
  providerId: string,
  entity: SyncEntity,
  options?: { dateRange?: PosDateRange }
): Promise<PosSyncResult> {
  const startTime = Date.now();

  // Charger le provider
  const provider = await prisma.posProvider.findUnique({
    where: { id: providerId },
    include: {
      storeLinks: true,
      employeeLinks: true,
    },
  });

  if (!provider) {
    return makeError("Provider introuvable", startTime);
  }

  if (!provider.active) {
    return makeError("Provider désactivé", startTime);
  }

  // Créer le log de sync
  const direction: SyncDirection =
    entity === "employees" ? "PUSH" : "PULL";

  const syncLog = await prisma.posSyncLog.create({
    data: {
      providerId,
      direction,
      status: "RUNNING",
      entityType: entity,
    },
  });

  try {
    // Instancier l'adaptateur
    const config: PosProviderConfig = {
      id: provider.id,
      type: provider.type,
      apiUrl: provider.apiUrl,
      apiKey: provider.apiKey,
      apiSecret: provider.apiSecret,
      accessToken: provider.accessToken,
      refreshToken: provider.refreshToken,
      tokenExpiresAt: provider.tokenExpiresAt,
      config: provider.config,
    };

    const adapter = await createPosAdapter(config);

    // Exécuter la sync selon l'entité
    let result: PosSyncResult;

    switch (entity) {
      case "employees":
        result = await syncEmployees(adapter, provider);
        break;
      case "timeclock":
        result = await syncTimeClocks(
          adapter,
          provider,
          options?.dateRange || getDefaultRange()
        );
        break;
      case "sales":
        result = await syncSales(
          adapter,
          provider,
          options?.dateRange || getDefaultRange()
        );
        break;
      case "stores":
        result = await syncStores(adapter, provider);
        break;
      default:
        result = makeError(`Entité inconnue: ${entity}`, startTime);
    }

    result.durationMs = Date.now() - startTime;

    // Mettre à jour le log
    await prisma.posSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: result.failed > 0 ? "PARTIAL" : "SUCCESS",
        totalRecords: result.totalRecords,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
        durationMs: result.durationMs,
        completedAt: new Date(),
        details: result.errors.length > 0
          ? JSON.stringify(result.errors)
          : null,
      },
    });

    // Mettre à jour lastSyncAt sur le provider
    await prisma.posProvider.update({
      where: { id: providerId },
      data: { lastSyncAt: new Date() },
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Erreur inconnue";

    await prisma.posSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "FAILED",
        errorMessage: errMsg,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });

    return makeError(errMsg, startTime);
  }
}

// ── Sync Employés (TimeWin → POS) ──

async function syncEmployees(
  adapter: PosAdapter,
  provider: { id: string; employeeLinks: { employeeId: string; posEmployeeId: string }[] }
): Promise<PosSyncResult> {
  const errors: PosSyncError[] = [];
  let created = 0, updated = 0, skipped = 0, failed = 0;

  // Récupérer les employés TimeWin actifs assignés aux magasins liés
  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      active: true,
    },
  });

  const linkedIds = new Set(provider.employeeLinks.map((l) => l.employeeId));

  for (const emp of employees) {
    try {
      if (linkedIds.has(emp.id)) {
        skipped++;
        continue;
      }

      // Pousser vers le POS
      const result = await adapter.pushEmployee({
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email || "",
        active: emp.active,
      });

      // Sauvegarder le lien
      await prisma.posEmployeeLink.create({
        data: {
          providerId: provider.id,
          employeeId: emp.id,
          posEmployeeId: result.posId,
          posEmployeeName: `${emp.firstName} ${emp.lastName}`,
          active: true,
          syncedAt: new Date(),
        },
      });

      created++;
    } catch (error) {
      failed++;
      errors.push({
        recordId: emp.id,
        message: error instanceof Error ? error.message : "Erreur push employé",
      });
    }
  }

  return {
    success: failed === 0,
    totalRecords: employees.length,
    created,
    updated,
    skipped,
    failed,
    errors,
    durationMs: 0,
  };
}

// ── Sync Pointages (POS → TimeWin) ──

async function syncTimeClocks(
  adapter: PosAdapter,
  provider: {
    id: string;
    storeLinks: { storeId: string; posStoreId: string }[];
    employeeLinks: { employeeId: string; posEmployeeId: string }[];
  },
  range: PosDateRange
): Promise<PosSyncResult> {
  const errors: PosSyncError[] = [];
  let created = 0, skipped = 0, failed = 0;

  const entries = await adapter.fetchTimeClocks(range);

  // Créer des maps de lookup
  const storeMap = new Map(
    provider.storeLinks.map((l) => [l.posStoreId, l.storeId])
  );
  const empMap = new Map(
    provider.employeeLinks.map((l) => [l.posEmployeeId, l.employeeId])
  );

  for (const entry of entries) {
    try {
      const storeId = storeMap.get(entry.posStoreId);
      const employeeId = empMap.get(entry.posEmployeeId);

      if (!storeId || !employeeId) {
        skipped++;
        continue;
      }

      // Calculer heures travaillées
      const [inH, inM] = entry.clockIn.split(":").map(Number);
      const outParts = entry.clockOut?.split(":").map(Number);
      let workedHours: number | null = null;
      if (outParts) {
        const totalMinutes =
          outParts[0] * 60 + outParts[1] - (inH * 60 + inM) - entry.breakMinutes;
        workedHours = Math.round((totalMinutes / 60) * 100) / 100;
      }

      // Trouver le shift correspondant pour comparer
      const dateObj = new Date(entry.date + "T00:00:00Z");
      const matchingShift = await prisma.shift.findFirst({
        where: {
          employeeId,
          storeId,
          date: dateObj,
        },
      });

      // Calculer le delta (écart en minutes vs planning)
      let deltaMinutes: number | null = null;
      let status: string | null = null;

      if (matchingShift) {
        const [shiftH, shiftM] = matchingShift.startTime.split(":").map(Number);
        const shiftStart = shiftH * 60 + shiftM;
        const actualStart = inH * 60 + inM;
        deltaMinutes = actualStart - shiftStart; // positif = retard

        if (Math.abs(deltaMinutes) <= 5) status = "on_time";
        else if (deltaMinutes > 5) status = "late";
        else status = "early";
      } else {
        status = "extra"; // Pas de shift planifié → heure sup
      }

      // Upsert (évite les doublons)
      await prisma.posTimeClock.upsert({
        where: {
          providerId_posRecordId: {
            providerId: provider.id,
            posRecordId: entry.posRecordId,
          },
        },
        create: {
          providerId: provider.id,
          employeeId,
          storeId,
          posRecordId: entry.posRecordId,
          date: dateObj,
          clockIn: entry.clockIn,
          clockOut: entry.clockOut,
          breakMinutes: entry.breakMinutes,
          workedHours,
          shiftId: matchingShift?.id || null,
          deltaMinutes,
          status,
        },
        update: {
          clockOut: entry.clockOut,
          breakMinutes: entry.breakMinutes,
          workedHours,
          shiftId: matchingShift?.id || null,
          deltaMinutes,
          status,
        },
      });

      created++;
    } catch (error) {
      failed++;
      errors.push({
        recordId: entry.posRecordId,
        message: error instanceof Error ? error.message : "Erreur import pointage",
      });
    }
  }

  return {
    success: failed === 0,
    totalRecords: entries.length,
    created,
    updated: 0,
    skipped,
    failed,
    errors,
    durationMs: 0,
  };
}

// ── Sync Ventes (POS → TimeWin) ──

async function syncSales(
  adapter: PosAdapter,
  provider: {
    id: string;
    storeLinks: { storeId: string; posStoreId: string }[];
  },
  range: PosDateRange
): Promise<PosSyncResult> {
  const errors: PosSyncError[] = [];
  let created = 0, skipped = 0, failed = 0;

  const entries = await adapter.fetchSales(range);
  const storeMap = new Map(
    provider.storeLinks.map((l) => [l.posStoreId, l.storeId])
  );

  for (const entry of entries) {
    try {
      const storeId = storeMap.get(entry.posStoreId);
      if (!storeId) {
        skipped++;
        continue;
      }

      await prisma.posSalesData.upsert({
        where: {
          providerId_storeId_date_hourSlot: {
            providerId: provider.id,
            storeId,
            date: new Date(entry.date + "T00:00:00Z"),
            hourSlot: entry.hourSlot,
          },
        },
        create: {
          providerId: provider.id,
          storeId,
          posRecordId: entry.posRecordId || null,
          date: new Date(entry.date + "T00:00:00Z"),
          hourSlot: entry.hourSlot,
          revenue: entry.revenue,
          transactions: entry.transactions,
          itemsSold: entry.itemsSold,
        },
        update: {
          revenue: entry.revenue,
          transactions: entry.transactions,
          itemsSold: entry.itemsSold,
        },
      });

      created++;
    } catch (error) {
      failed++;
      errors.push({
        recordId: entry.posRecordId,
        message: error instanceof Error ? error.message : "Erreur import vente",
      });
    }
  }

  return {
    success: failed === 0,
    totalRecords: entries.length,
    created,
    updated: 0,
    skipped,
    failed,
    errors,
    durationMs: 0,
  };
}

// ── Sync Magasins (POS → mapping) ──

async function syncStores(
  adapter: PosAdapter,
  provider: { id: string }
): Promise<PosSyncResult> {
  const posStores = await adapter.fetchStores();
  return {
    success: true,
    totalRecords: posStores.length,
    created: 0,
    updated: 0,
    skipped: posStores.length,
    failed: 0,
    errors: [],
    durationMs: 0,
  };
}

// ── Helpers ──

function getDefaultRange(): PosDateRange {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split("T")[0],
    to: now.toISOString().split("T")[0],
  };
}

function makeError(message: string, startTime: number): PosSyncResult {
  return {
    success: false,
    totalRecords: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [{ message }],
    durationMs: Date.now() - startTime,
  };
}
