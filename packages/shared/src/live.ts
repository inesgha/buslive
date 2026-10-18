import { z } from 'zod';

import { distanceMeters, type GeoPoint } from './geo';

/**
 * Partage de position « Je suis dans le bus » et bus en direct.
 * Les règles ci-dessous sont partagées : l'API les applique, l'app les affiche.
 */
export const LIVE_RULES = {
  /** Précision GPS minimale acceptée (m). */
  maxAccuracyMeters: 100,
  /** Vitesse maximale plausible pour un bus (m/s) : 120 km/h. */
  maxSpeedMetersPerSecond: 120 / 3.6,
  /** En dessous de cette distance, pas de contrôle de vitesse (bruit du GPS). */
  speedCheckMinDistanceMeters: 50,
  /** Distance maximale au tracé de la ligne (m). */
  maxDistanceToRouteMeters: 300,
  /** Intervalle minimal entre deux positions acceptées (s). */
  minIntervalSeconds: 5,
  /** Deux passagers plus proches que cela sur le même sens = le même bus (m). */
  sameVehicleMeters: 150,
  /** Un passager sans position depuis ce délai n'est plus affiché (s). */
  staleAfterSeconds: 120,
  /** Le partage s'arrête seul sans position pendant ce délai (min). */
  inactiveAfterMinutes: 10,
  /** Durée maximale d'un partage (min). */
  maxDurationMinutes: 180,
  /** Distance au dernier arrêt considérée comme « arrivé au terminus » (m). */
  terminusRadiusMeters: 100,
  /** Nombre maximal de positions par envoi. */
  maxBatchSize: 20,
} as const;

// --- Requêtes et réponses ----------------------------------------------------

export const StartLiveSessionSchema = z.object({
  lineId: z.uuid(),
  directionId: z.uuid(),
});
export type StartLiveSessionInput = z.infer<typeof StartLiveSessionSchema>;

export const LiveSessionEndReasonSchema = z.enum([
  'USER',
  'TERMINUS',
  'INACTIVE',
  'MAX_DURATION',
  'REPLACED',
]);
export type LiveSessionEndReason = z.infer<typeof LiveSessionEndReasonSchema>;

export const LiveSessionSchema = z.object({
  id: z.uuid(),
  lineId: z.uuid(),
  directionId: z.uuid(),
  status: z.enum(['ACTIVE', 'ENDED']),
  endReason: LiveSessionEndReasonSchema.nullable(),
  startedAt: z.iso.datetime(),
});
export type LiveSession = z.infer<typeof LiveSessionSchema>;

/** Une position mesurée par le téléphone. */
export const PositionSampleSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Précision horizontale annoncée par le GPS (m). */
  accuracy: z.number().nonnegative(),
  recordedAt: z.iso.datetime(),
});
export type PositionSample = z.infer<typeof PositionSampleSchema>;

export const PositionBatchSchema = z.object({
  points: z.array(PositionSampleSchema).min(1).max(LIVE_RULES.maxBatchSize),
});
export type PositionBatch = z.infer<typeof PositionBatchSchema>;

export const PositionBatchResultSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  /** La dernière position acceptée est-elle sur le parcours de la ligne ? */
  onRoute: z.boolean(),
  /** Passagers (dont soi) qui partagent la position du même bus. */
  sharersOnVehicle: z.number().int().nonnegative(),
  session: LiveSessionSchema,
});
export type PositionBatchResult = z.infer<typeof PositionBatchResultSchema>;

/** Un bus en direct (anonyme : aucune information sur les passagers). */
export const LiveVehicleSchema = z.object({
  id: z.string(),
  lineId: z.uuid(),
  directionId: z.uuid(),
  latitude: z.number(),
  longitude: z.number(),
  /** Avancement sur le parcours, en « minutes depuis le terminus ». */
  progressMinutes: z.number().nonnegative(),
  sharers: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type LiveVehicle = z.infer<typeof LiveVehicleSchema>;

/** Bus en direct d'une ligne (réponse REST et message Socket.io « vehicles »). */
export const LineVehiclesSchema = z.object({
  lineId: z.uuid(),
  vehicles: z.array(LiveVehicleSchema),
});
export type LineVehicles = z.infer<typeof LineVehiclesSchema>;

/** Événements Socket.io de l'espace « /live ». */
export const LIVE_EVENTS = {
  watchLine: 'watch:line',
  unwatchLine: 'unwatch:line',
  vehicles: 'vehicles',
  /** Nouveau signalement ou changement de statut sur la ligne (phase 7). */
  reports: 'reports',
} as const;

// --- Règles de validation (fonctions pures) -----------------------------------

interface TimedPoint {
  point: GeoPoint;
  /** Instant de la mesure (ms). */
  at: number;
}

/** Le déplacement entre deux positions est-il physiquement possible pour un bus ? */
export function isSpeedPlausible(previous: TimedPoint, next: TimedPoint): boolean {
  const distance = distanceMeters(previous.point, next.point);
  if (distance < LIVE_RULES.speedCheckMinDistanceMeters) return true;
  const seconds = (next.at - previous.at) / 1000;
  if (seconds <= 0) return false;
  return distance / seconds <= LIVE_RULES.maxSpeedMetersPerSecond;
}

// --- Regroupement des passagers en bus ----------------------------------------

export interface SharerState {
  sessionId: string;
  directionId: string;
  position: GeoPoint;
  distanceAlongMeters: number;
  progressMinutes: number;
  /** Instant de la dernière position acceptée (ms). */
  updatedAt: number;
  /**
   * Poids du passager dans la position du bus (selon son score de confiance,
   * voir voteWeight). 1 par défaut.
   */
  weight?: number;
}

export interface VehicleGroup {
  /** Identifiant stable tant que le premier passager du groupe reste dedans. */
  id: string;
  directionId: string;
  position: GeoPoint;
  progressMinutes: number;
  sharers: number;
  updatedAt: number;
  /** Sessions regroupées dans ce bus. Usage interne à l'API : jamais diffusé (vie privée). */
  sessionIds: string[];
}

/**
 * Regroupe les passagers d'un même sens en bus : triés par avancement sur le
 * parcours, deux passagers consécutifs à moins de 150 m font partie du même bus.
 * La position du bus est la moyenne de celles de ses passagers.
 */
export function groupIntoVehicles(sharers: readonly SharerState[]): VehicleGroup[] {
  const byDirection = new Map<string, SharerState[]>();
  for (const sharer of sharers) {
    byDirection.set(sharer.directionId, [...(byDirection.get(sharer.directionId) ?? []), sharer]);
  }

  const vehicles: VehicleGroup[] = [];
  for (const [directionId, list] of byDirection) {
    const sorted = [...list].sort((a, b) => a.distanceAlongMeters - b.distanceAlongMeters);
    let group: SharerState[] = [];
    const flush = () => {
      if (group.length > 0) vehicles.push(toVehicle(directionId, group));
      group = [];
    };
    for (const sharer of sorted) {
      const last = group.at(-1);
      if (
        last &&
        sharer.distanceAlongMeters - last.distanceAlongMeters > LIVE_RULES.sameVehicleMeters
      ) {
        flush();
      }
      group.push(sharer);
    }
    flush();
  }
  return vehicles;
}

function toVehicle(directionId: string, group: SharerState[]): VehicleGroup {
  // Moyenne PONDÉRÉE par la confiance : un passager fiable pèse plus qu'un nouveau.
  const totalWeight = group.reduce((sum, s) => sum + (s.weight ?? 1), 0);
  const average = (pick: (s: SharerState) => number) =>
    group.reduce((sum, s) => sum + pick(s) * (s.weight ?? 1), 0) / totalWeight;
  // Identifiant : le plus petit identifiant de session du groupe (stable et déterministe).
  const sessionIds = group.map((s) => s.sessionId).sort();
  const id = `vehicle-${sessionIds[0]}`;
  return {
    id,
    directionId,
    position: {
      latitude: average((s) => s.position.latitude),
      longitude: average((s) => s.position.longitude),
    },
    progressMinutes: average((s) => s.progressMinutes),
    sharers: group.length,
    updatedAt: Math.max(...group.map((s) => s.updatedAt)),
    sessionIds,
  };
}
