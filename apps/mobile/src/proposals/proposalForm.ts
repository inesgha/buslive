import {
  distanceMeters,
  type GeoPoint,
  type LineBadgeInfo,
  type NearbyStop,
  type StopProposalInput,
  StopProposalInputSchema,
} from '@buslive/shared';

/**
 * Proposer un arrêt : logique sans interface (testable).
 * Le passager choisit le point par un appui long sur la carte, mais doit être
 * SUR PLACE (à moins de 150 m) : on évite les propositions faites de chez soi.
 * Sa position ne sert qu'à ce contrôle et n'est pas envoyée.
 */
export const MAX_DISTANCE_FROM_POINT_METERS = 150;

export function isCloseEnough(user: GeoPoint | null, point: GeoPoint): boolean {
  return user !== null && distanceMeters(user, point) <= MAX_DISTANCE_FROM_POINT_METERS;
}

/** Lignes des arrêts voisins, sans doublon, triées : ce sont les lignes probables. */
export function linesAround(stops: readonly NearbyStop[]): LineBadgeInfo[] {
  const byId = new Map<string, LineBadgeInfo>();
  for (const stop of stops) for (const line of stop.lines) byId.set(line.id, line);
  return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
}

export interface ProposalDraft {
  nameFr: string;
  nameAr: string;
  lineIds: string[];
}

/** Brouillon → corps de POST /stops/proposals, ou null s'il est incomplet. */
export function buildProposalInput(
  draft: ProposalDraft,
  point: GeoPoint,
  accuracy: number | null,
): StopProposalInput | null {
  const parsed = StopProposalInputSchema.safeParse({
    nameFr: draft.nameFr,
    // Le nom arabe est facultatif : un modérateur pourra le compléter.
    nameAr: draft.nameAr.trim() === '' ? undefined : draft.nameAr,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: accuracy ?? Number.POSITIVE_INFINITY,
    lineIds: draft.lineIds,
  });
  return parsed.success ? parsed.data : null;
}
