/**
 * Module Payroll Inputs (Étage 2) — agrégation des faits horaires qualifiés en
 * variables de paie (QUANTITÉS uniquement, aucune valorisation en euros).
 */
export * from "./types";
export * from "./hours";
export * from "./holidays";
export * from "./qualify";
export * from "./aggregate";
export * from "./export";
export * from "./source";
export * from "./dsn";
export * from "./payslip-acl";
export * from "./service";
export * from "./persistence";
export * from "./siret";
// Note : `repository.ts` (accès DB) n'est volontairement PAS ré-exporté ici
// pour éviter toute fuite de code serveur (prisma) dans un bundle client.
