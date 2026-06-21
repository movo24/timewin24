import { prisma } from "./prisma";

export async function logAudit(
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE" | "IMPORT",
  entity: string,
  entityId: string,
  diff?: Record<string, unknown> | null,
  _newData?: unknown
) {
  try {
    // Service API keys have userId like "service:xxx" — not a real User FK.
    // Skip audit log for service keys to avoid FK constraint violation.
    if (userId.startsWith("service:")) {
      console.log(
        `[AUDIT] ${action} ${entity}/${entityId} by ${userId} (service key — no DB log)`
      );
      return;
    }

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        diff: diff ? JSON.stringify(diff) : null,
      },
    });
  } catch (error) {
    // Audit logging should never crash the main operation
    console.error(`[AUDIT] Failed to log ${action} ${entity}/${entityId}:`, error);
  }
}
