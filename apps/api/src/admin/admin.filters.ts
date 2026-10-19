import type { Prisma } from '../generated/prisma/client';

/**
 * Files de modération (filtres partagés par le tableau de bord et les listes) :
 * une seule définition, pour que le compteur affiché corresponde à la liste.
 */

/** Signalements en cours contestés (des « pour » ET des « contre ») ou cachés. */
export const CONTESTED_REPORTS = {
  status: 'ACTIVE',
  OR: [{ hidden: true }, { confirmCount: { gt: 0 }, denyCount: { gt: 0 } }],
} satisfies Prisma.ReportWhereInput;

/** « Arrêts déplacés » confirmés par les passagers, pas encore examinés. */
export const PENDING_STOP_MOVES = {
  type: 'STOP_MOVED',
  status: 'CONFIRMED',
  moderatedAt: null,
  proposedLatitude: { not: null },
  proposedLongitude: { not: null },
} satisfies Prisma.ReportWhereInput;

/** Arrêts proposés par des passagers, en attente. */
export const PENDING_STOP_PROPOSALS = {
  status: 'PENDING',
  proposedById: { not: null },
} satisfies Prisma.StopWhereInput;
