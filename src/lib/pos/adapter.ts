// ─── POS Adapter Interface ─────────────────────────
// Contrat que chaque fournisseur POS doit implémenter.
//
// Pour ajouter un nouveau POS :
// 1. Créer un fichier dans src/lib/pos/adapters/mon-pos.ts
// 2. Implémenter l'interface PosAdapter
// 3. L'enregistrer dans la factory (src/lib/pos/factory.ts)
//
// Chaque méthode est optionnelle (throw "Not supported" si le POS ne supporte pas).

import type {
  PosProviderConfig,
  PosEmployee,
  PosStore,
  PosTimeClockEntry,
  PosSalesEntry,
  PosDateRange,
} from "./types";

export interface PosAdapter {
  /** Nom du fournisseur pour les logs */
  readonly providerName: string;

  /** Initialise la connexion (vérification token, refresh si expiré) */
  initialize(config: PosProviderConfig): Promise<void>;

  /** Teste la connexion au POS — retourne true si OK */
  testConnection(): Promise<boolean>;

  // ── Employés ──────────────────────────────────────

  /** Récupère la liste des employés côté POS */
  fetchEmployees(): Promise<PosEmployee[]>;

  /** Crée/met à jour un employé côté POS (push TimeWin → POS) */
  pushEmployee(employee: {
    name: string;
    email: string;
    pin?: string;
    role?: string;
    active: boolean;
  }): Promise<{ posId: string }>;

  /** Désactive un employé côté POS */
  deactivateEmployee(posEmployeeId: string): Promise<void>;

  // ── Magasins ──────────────────────────────────────

  /** Récupère la liste des magasins côté POS */
  fetchStores(): Promise<PosStore[]>;

  // ── Pointages ─────────────────────────────────────

  /** Récupère les pointages pour une période donnée */
  fetchTimeClocks(range: PosDateRange): Promise<PosTimeClockEntry[]>;

  // ── Ventes ────────────────────────────────────────

  /** Récupère les données de vente agrégées par heure */
  fetchSales(range: PosDateRange): Promise<PosSalesEntry[]>;

  // ── Webhook (optionnel) ───────────────────────────

  /** Parse et valide un webhook entrant du POS */
  parseWebhook?(
    headers: Record<string, string>,
    body: unknown,
    secret: string
  ): Promise<{
    event: "timeclock" | "sale" | "employee" | "unknown";
    data: unknown;
  }>;
}

/** Type helper pour les adaptateurs partiels (POS qui ne supportent pas tout) */
export type PartialPosAdapter = Partial<PosAdapter> &
  Pick<PosAdapter, "providerName" | "initialize" | "testConnection">;
