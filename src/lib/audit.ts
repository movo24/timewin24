import { prisma } from "./prisma";

export async function logAudit(
  userId: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entity: string,
  entityId: string,
  diff?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      diff: diff ? JSON.stringify(diff) : null,
    },
  });
}
