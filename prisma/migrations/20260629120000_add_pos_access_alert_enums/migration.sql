-- Migration: alertes d'accès caisse hors planning (POS)
--
-- ADDITIVE : ajoute des valeurs aux enums d'alerte manager. Aucune table modifiée.
-- SQL généré via `prisma migrate diff`. Referme la dérive schema.prisma <-> migrations/.
-- S'applique via `prisma migrate deploy` ou `prisma db push`.
--
-- NOTE PostgreSQL : `ALTER TYPE ... ADD VALUE` requiert PostgreSQL >= 12 pour
-- s'exécuter dans une transaction (cas de `prisma migrate deploy`). Les valeurs
-- ajoutées ne sont pas utilisées dans cette même migration, donc pas de conflit.

-- AlterEnum
ALTER TYPE "ManagerAlertType" ADD VALUE 'UNSCHEDULED_POS_ACCESS';
ALTER TYPE "ManagerAlertType" ADD VALUE 'FORBIDDEN_POS_ACCESS';

-- AlterEnum
ALTER TYPE "ManagerAlertSeverity" ADD VALUE 'URGENT';
