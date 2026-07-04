/**
 * Contrôle de périmètre magasin (multi-magasin) — logique PURE.
 *
 * Convention (miroir de `getAccessibleStoreIds`) : `accessible === null` = ADMIN
 * (tous les magasins) ; `accessible = []` = aucun magasin ; sinon liste des
 * `storeId` autorisés. Un MANAGER ne doit lire/écrire/dupliquer/supprimer que
 * les données de SES magasins.
 */

/** Vrai si `storeId` est dans le périmètre autorisé (admin = tout). */
export function isStoreAccessible(accessible: string[] | null, storeId: string): boolean {
  return accessible === null || accessible.includes(storeId);
}

export type StoreWhere = string | { in: string[] } | undefined;

/**
 * Filtre `storeId` effectif pour un endpoint liste acceptant un `storeId`
 * optionnel (et éventuellement la valeur spéciale `"all"`).
 *
 *  - Admin (null) : magasin demandé, sinon tout (`undefined`).
 *  - Non-admin sans demande précise : restreint à l'ensemble autorisé.
 *  - Non-admin demandant un magasin hors périmètre : `{ ok: false }` (→ 403).
 */
export function resolveStoreWhere(
  accessible: string[] | null,
  requested?: string | null
): { ok: true; where: StoreWhere } | { ok: false } {
  const req = requested && requested !== "all" ? requested : null;

  if (accessible === null) {
    return { ok: true, where: req ?? undefined };
  }
  if (req) {
    return accessible.includes(req) ? { ok: true, where: req } : { ok: false };
  }
  return { ok: true, where: { in: accessible } };
}

/**
 * Variante pour un filtre sur une relation imbriquée `stores: { some: { storeId } }`
 * (ex: Employee → StoreEmployee). Renvoie le sous-filtre `storeId` à injecter, ou
 * `{ ok: false }` si hors périmètre. `where === undefined` = aucun filtre (admin, tout).
 */
export function resolveNestedStoreFilter(
  accessible: string[] | null,
  requested?: string | null
): { ok: true; storeIdFilter: string | { in: string[] } | undefined } | { ok: false } {
  const r = resolveStoreWhere(accessible, requested);
  if (!r.ok) return { ok: false };
  return { ok: true, storeIdFilter: r.where };
}
