import { distanceMeters, type GeoPoint } from './geo';
import { etaMinutes, progressMinutes, projectOnRoute, stopMilestones } from './route';

/** Point situé à « ratio » du segment [a, b]. */
function between(a: GeoPoint, b: GeoPoint, ratio: number): GeoPoint {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * ratio,
    longitude: a.longitude + (b.longitude - a.longitude) * ratio,
  };
}

// Tracé de démonstration de la ligne 10 : gare de Mahdia → Rejiche → Ksour Essef (station).
const gare = { latitude: 35.4978, longitude: 11.0473 };
const rejiche = { latitude: 35.4705, longitude: 11.0336 };
const station = { latitude: 35.4207, longitude: 10.9889 };
const shape = [gare, rejiche, station];
const stops = [
  { ...gare, minutesFromStart: 0 },
  { ...rejiche, minutesFromStart: 12 },
  { ...station, minutesFromStart: 27 },
];

describe('projectOnRoute', () => {
  it('donne 0 m du tracé et la bonne distance parcourue pour un point sur le tracé', () => {
    const middle = between(gare, rejiche, 0.5);
    const projection = projectOnRoute(middle, shape);
    expect(projection.distanceToRouteMeters).toBeLessThan(1);
    expect(projection.distanceAlongMeters).toBeCloseTo(distanceMeters(gare, rejiche) / 2, -1);
  });

  it('mesure l’écart d’un point à côté du tracé', () => {
    // ~200 m à l'est du milieu du premier segment.
    const middle = between(gare, rejiche, 0.5);
    const offRoute = { latitude: middle.latitude, longitude: middle.longitude + 0.0022 };
    const { distanceToRouteMeters } = projectOnRoute(offRoute, shape);
    expect(distanceToRouteMeters).toBeGreaterThan(150);
    expect(distanceToRouteMeters).toBeLessThan(250);
  });

  it('cumule les segments : un point sur le 2e segment est plus loin que tout le 1er', () => {
    const onSecond = between(rejiche, station, 0.25);
    expect(projectOnRoute(onSecond, shape).distanceAlongMeters).toBeGreaterThan(
      distanceMeters(gare, rejiche),
    );
  });
});

describe('progressMinutes / etaMinutes', () => {
  const milestones = stopMilestones(shape, stops);

  it('interpole les minutes entre deux arrêts', () => {
    const halfway = projectOnRoute(between(rejiche, station, 0.5), shape).distanceAlongMeters;
    expect(progressMinutes(halfway, milestones)).toBeCloseTo(19.5, 0);
  });

  it('reste borné au premier et au dernier arrêt', () => {
    expect(progressMinutes(-100, milestones)).toBe(0);
    expect(progressMinutes(1e9, milestones)).toBe(27);
  });

  it('calcule le temps d’arrivée à un arrêt devant, null pour un arrêt dépassé', () => {
    expect(etaMinutes(19.5, 27)).toBe(8);
    expect(etaMinutes(19.5, 12)).toBeNull();
    expect(etaMinutes(26.8, 27)).toBe(0);
  });
});
