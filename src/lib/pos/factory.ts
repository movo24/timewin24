// ─── POS Adapter Factory ───────────────────────────
// Instancie le bon adaptateur selon le type de POS configuré.
//
// Pour ajouter un nouveau POS :
// 1. Créer l'adaptateur dans src/lib/pos/adapters/
// 2. Ajouter le case dans createAdapter()

import type { PosAdapter } from "./adapter";
import type { PosProviderConfig } from "./types";
import { MockPosAdapter } from "./adapters/mock";

/**
 * Crée et initialise un adaptateur POS pour le provider donné.
 */
export async function createPosAdapter(
  config: PosProviderConfig
): Promise<PosAdapter> {
  const adapter = createAdapter(config.type);
  await adapter.initialize(config);
  return adapter;
}

function createAdapter(type: string): PosAdapter {
  switch (type) {
    case "CUSTOM_API":
      // L'adaptateur mock sert aussi pour les APIs custom en dev
      return new MockPosAdapter();

    // ── Futurs adaptateurs ──
    // case "LIGHTSPEED":
    //   return new LightspeedAdapter();
    // case "SQUARE":
    //   return new SquareAdapter();
    // case "ZELTY":
    //   return new ZeltyAdapter();
    // case "SUMUP":
    //   return new SumupAdapter();

    default:
      // En dev/test, on utilise le mock par défaut
      console.warn(
        `[POS Factory] No adapter for type "${type}", using MockPosAdapter`
      );
      return new MockPosAdapter();
  }
}
