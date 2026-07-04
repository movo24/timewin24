jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createPosAdapter } from "@/lib/pos/factory";
import { logger } from "@/lib/logger";
import type { PosProviderConfig } from "@/lib/pos/types";

// M116 / POS — fabrique d'adaptateur : instancie le bon adaptateur selon le
// type de provider, initialise avec la config, fallback Mock pour les types
// inconnus (resilience dev).

const warn = logger.warn as jest.Mock;

const cfg = (type: string): PosProviderConfig => ({
  id: "p1", type, apiUrl: null, apiKey: null, apiSecret: null,
  accessToken: null, refreshToken: null, tokenExpiresAt: null, config: null,
});

beforeEach(() => warn.mockReset());

describe("createPosAdapter", () => {
  it("CUSTOM_API -> adaptateur Mock initialise (sans warning)", async () => {
    const adapter = await createPosAdapter(cfg("CUSTOM_API"));
    expect(adapter.providerName).toBe("Mock POS (Dev)");
    // initialize a bien renseigne la config -> testConnection passe
    expect(await adapter.testConnection()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("type inconnu -> fallback Mock avec un warning", async () => {
    const adapter = await createPosAdapter(cfg("LIGHTSPEED"));
    expect(adapter.providerName).toBe("Mock POS (Dev)");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("LIGHTSPEED");
  });

  it("retourne une nouvelle instance a chaque appel", async () => {
    const a = await createPosAdapter(cfg("CUSTOM_API"));
    const b = await createPosAdapter(cfg("CUSTOM_API"));
    expect(a).not.toBe(b);
  });
});
