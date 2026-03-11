// POS Bridge — Public API
export type { PosAdapter, PartialPosAdapter } from "./adapter";
export type {
  PosEmployee,
  PosStore,
  PosTimeClockEntry,
  PosSalesEntry,
  PosSyncResult,
  PosSyncError,
  PosProviderConfig,
  PosDateRange,
} from "./types";
export { createPosAdapter } from "./factory";
export { runSync } from "./sync-engine";
