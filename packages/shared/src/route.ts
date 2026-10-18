import { distanceMeters, type GeoPoint } from './geo';

/**
 * Géométrie d'un parcours, en pur TypeScript (sans PostGIS) : utilisée par
 * l'API pour chaque position reçue (rapide, en mémoire) et par l'app.
 *
 * Sur quelques kilomètres, on peut assimiler la Terre à un plan : on convertit
 * les degrés en mètres autour du point étudié (projection équirectangulaire).
 * L'erreur reste de l'ordre du mètre, largement suffisante ici.
 */

const METERS_PER_DEGREE_LAT = 111_320;

function toLocalMeters(point: GeoPoint, origin: GeoPoint): { x: number; y: number } {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    x: (point.longitude - origin.longitude) * metersPerDegreeLng,
    y: (point.latitude - origin.latitude) * METERS_PER_DEGREE_LAT,
  };
}

export interface RouteProjection {
  /** Distance entre le point et le tracé (m). */
  distanceToRouteMeters: number;
  /** Distance parcourue depuis le début du tracé jusqu'au point projeté (m). */
  distanceAlongMeters: number;
}

/**
 * Projette un point sur le tracé (suite de segments) : trouve le point du tracé
 * le plus proche, et la distance parcourue jusqu'à lui depuis le terminus.
 */
export function projectOnRoute(point: GeoPoint, shape: readonly GeoPoint[]): RouteProjection {
  if (shape.length === 0) throw new Error('Tracé vide.');
  if (shape.length === 1) {
    return { distanceToRouteMeters: distanceMeters(point, shape[0]!), distanceAlongMeters: 0 };
  }

  let best: RouteProjection = { distanceToRouteMeters: Infinity, distanceAlongMeters: 0 };
  let travelled = 0;
  for (let i = 0; i < shape.length - 1; i++) {
    const start = shape[i]!;
    const end = shape[i + 1]!;
    const a = toLocalMeters(start, point);
    const b = toLocalMeters(end, point);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLength = Math.hypot(dx, dy);
    // Position du projeté sur le segment, bornée entre ses deux extrémités (0 → 1).
    const t =
      segmentLength === 0
        ? 0
        : Math.min(1, Math.max(0, (-a.x * dx - a.y * dy) / (segmentLength * segmentLength)));
    const distance = Math.hypot(a.x + t * dx, a.y + t * dy); // le point étudié est l'origine
    if (distance < best.distanceToRouteMeters) {
      best = {
        distanceToRouteMeters: distance,
        distanceAlongMeters: travelled + t * segmentLength,
      };
    }
    travelled += segmentLength;
  }
  return best;
}

/** Repère d'un arrêt sur le parcours : distance depuis le terminus et temps de trajet prévu. */
export interface StopMilestone {
  distanceAlongMeters: number;
  minutesFromStart: number;
}

/** Positionne chaque arrêt sur le tracé (dans l'ordre du parcours). */
export function stopMilestones(
  shape: readonly GeoPoint[],
  stops: readonly (GeoPoint & { minutesFromStart: number })[],
): StopMilestone[] {
  return stops.map((stop) => ({
    distanceAlongMeters: projectOnRoute(stop, shape).distanceAlongMeters,
    minutesFromStart: stop.minutesFromStart,
  }));
}

/**
 * Convertit une distance parcourue en « minutes depuis le terminus » en
 * interpolant entre les arrêts encadrants. Exemple : à mi-chemin entre un arrêt
 * à 12 min et un arrêt à 27 min → 19,5 min.
 */
export function progressMinutes(
  distanceAlong: number,
  milestones: readonly StopMilestone[],
): number {
  if (milestones.length === 0) return 0;
  const first = milestones[0]!;
  if (distanceAlong <= first.distanceAlongMeters) return first.minutesFromStart;
  for (let i = 0; i < milestones.length - 1; i++) {
    const from = milestones[i]!;
    const to = milestones[i + 1]!;
    if (distanceAlong <= to.distanceAlongMeters) {
      const span = to.distanceAlongMeters - from.distanceAlongMeters;
      const ratio = span === 0 ? 1 : (distanceAlong - from.distanceAlongMeters) / span;
      return from.minutesFromStart + ratio * (to.minutesFromStart - from.minutesFromStart);
    }
  }
  return milestones.at(-1)!.minutesFromStart;
}

/**
 * Temps d'arrivée estimé d'un bus à un arrêt, en minutes (arrondi).
 * null si le bus a déjà dépassé l'arrêt.
 */
export function etaMinutes(vehicleProgress: number, stopMinutesFromStart: number): number | null {
  const remaining = stopMinutesFromStart - vehicleProgress;
  // Petite tolérance : un bus « à » l'arrêt (GPS imprécis) compte encore comme à venir.
  if (remaining < -0.5) return null;
  return Math.max(0, Math.round(remaining));
}
