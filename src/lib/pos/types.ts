// ─── POS Bridge Types ──────────────────────────────
// Types standardisés pour la communication TimeWin ↔ POS
// Chaque adaptateur (Lightspeed, Square, etc.) mappe ses données vers ces types

// ── Employé côté POS ──
export interface PosEmployee {
  posId: string;          // ID unique côté POS
  name: string;           // Nom affiché côté POS
  email?: string;         // Email (pour matching auto)
  pin?: string;           // Code PIN caisse
  role?: string;          // Rôle POS (cashier, manager, etc.)
  active: boolean;
}

// ── Magasin côté POS ──
export interface PosStore {
  posId: string;
  name: string;
  address?: string;
  active: boolean;
}

// ── Pointage côté POS ──
export interface PosTimeClockEntry {
  posRecordId: string;    // ID unique pour dédoublonnage
  posEmployeeId: string;  // ID employé côté POS
  posStoreId: string;     // ID magasin côté POS
  date: string;           // "YYYY-MM-DD"
  clockIn: string;        // "HH:mm"
  clockOut: string | null; // "HH:mm" ou null si encore en cours
  breakMinutes: number;
}

// ── Vente horaire côté POS ──
export interface PosSalesEntry {
  posRecordId?: string;
  posStoreId: string;
  date: string;           // "YYYY-MM-DD"
  hourSlot: number;       // 0-23
  revenue: number;        // € CA
  transactions: number;
  itemsSold: number;
}

// ── Résultat de synchronisation ──
export interface PosSyncResult {
  success: boolean;
  totalRecords: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: PosSyncError[];
  durationMs: number;
}

export interface PosSyncError {
  recordId?: string;
  message: string;
  details?: unknown;
}

// ── Configuration d'un provider (passée à l'adaptateur) ──
export interface PosProviderConfig {
  id: string;
  type: string;
  apiUrl: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  config: string | null;  // JSON libre
}

// ── Période de requête ──
export interface PosDateRange {
  from: string;  // "YYYY-MM-DD"
  to: string;    // "YYYY-MM-DD"
}
