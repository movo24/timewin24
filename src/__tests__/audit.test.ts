jest.mock("@/lib/prisma", () => ({ prisma: { auditLog: { create: jest.fn() } } }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// M116 / audit — journal d'audit : ne doit JAMAIS faire echouer l'operation
// principale (erreurs avalees) et saute les cles de service (pas de FK User).

const create = prisma.auditLog.create as jest.Mock;
const errorLog = logger.error as jest.Mock;
const debugLog = logger.debug as jest.Mock;

beforeEach(() => {
  create.mockReset().mockResolvedValue({});
  errorLog.mockReset();
  debugLog.mockReset();
});

describe("logAudit", () => {
  it("ecrit une ligne d'audit pour un utilisateur reel (diff serialise)", async () => {
    await logAudit("u1", "UPDATE", "Employee", "e1", { name: ["old", "new"] });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "u1", action: "UPDATE", entity: "Employee", entityId: "e1",
        diff: JSON.stringify({ name: ["old", "new"] }),
      },
    });
  });

  it("met diff a null quand aucun diff n'est fourni", async () => {
    await logAudit("u1", "CREATE", "Store", "s1");
    expect(create.mock.calls[0][0].data.diff).toBeNull();
  });

  it("saute l'ecriture DB pour une cle de service (pas de FK User)", async () => {
    await logAudit("service:abc", "DELETE", "Product", "p1");
    expect(create).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalled();
  });

  it("avale les erreurs DB sans jamais throw (resilience)", async () => {
    create.mockRejectedValue(new Error("DB down"));
    await expect(logAudit("u1", "IMPORT", "Employee", "e1")).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
  });
});
