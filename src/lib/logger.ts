/**
 * Logger conditionné (M141).
 *
 * - `error` / `warn` : toujours émis (observabilité prod indispensable — ex.
 *   blocs catch des routes API).
 * - `info` / `debug` : émis uniquement hors production (ou si `LOG_LEVEL=debug`),
 *   pour supprimer le bruit de logs en prod sans perdre les vrais incidents.
 *
 * Remplace les `console.*` directs. Aucune dépendance → utilisable partout
 * (serveur, edge, client) sans risque d'import circulaire.
 */
const verbose =
  process.env.NODE_ENV !== "production" || process.env.LOG_LEVEL === "debug";

export const logger = {
  debug: (...args: unknown[]) => {
    if (verbose) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (verbose) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
