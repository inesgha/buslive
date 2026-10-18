import {
  type GeoPoint,
  groupIntoVehicles,
  LIVE_RULES,
  type LineVehicles,
  type SharerState,
  type VehicleGroup,
} from '@buslive/shared';
import { Injectable } from '@nestjs/common';

/** Un partage en cours, tel que gardé en mémoire. */
export interface ActiveSharer {
  sessionId: string;
  userId: string;
  lineId: string;
  directionId: string;
  /** Début du partage (ms). */
  startedAt: number;
  /** Dernière position acceptée (null tant qu'aucune ne l'a été). */
  last: {
    position: GeoPoint;
    /** Instant de la mesure (ms). */
    recordedAt: number;
    distanceAlongMeters: number;
    progressMinutes: number;
  } | null;
}

/**
 * Registre EN MÉMOIRE des partages en cours. Les positions ne sont pas écrites
 * en base (vie privée et performances) : seule la dernière y est recopiée.
 * Limite connue : avec plusieurs instances de l'API, il faudra un registre
 * partagé (Redis, phase 11).
 */
@Injectable()
export class LiveRegistry {
  private readonly sharers = new Map<string, ActiveSharer>();

  add(sharer: ActiveSharer): void {
    this.sharers.set(sharer.sessionId, sharer);
  }

  get(sessionId: string): ActiveSharer | undefined {
    return this.sharers.get(sessionId);
  }

  remove(sessionId: string): ActiveSharer | undefined {
    const sharer = this.sharers.get(sessionId);
    this.sharers.delete(sessionId);
    return sharer;
  }

  all(): ActiveSharer[] {
    return [...this.sharers.values()];
  }

  /** Bus en direct d'une ligne, à partir des passagers qui ont une position récente. */
  vehicleGroups(lineId: string, now: number): VehicleGroup[] {
    const fresh: SharerState[] = [];
    for (const sharer of this.sharers.values()) {
      if (sharer.lineId !== lineId || !sharer.last) continue;
      if (now - sharer.last.recordedAt > LIVE_RULES.staleAfterSeconds * 1000) continue;
      fresh.push({
        sessionId: sharer.sessionId,
        directionId: sharer.directionId,
        position: sharer.last.position,
        distanceAlongMeters: sharer.last.distanceAlongMeters,
        progressMinutes: sharer.last.progressMinutes,
        updatedAt: sharer.last.recordedAt,
      });
    }
    return groupIntoVehicles(fresh);
  }

  /** Message diffusé aux spectateurs d'une ligne (aucune information sur les passagers). */
  lineVehicles(lineId: string, now: number): LineVehicles {
    return {
      lineId,
      vehicles: this.vehicleGroups(lineId, now).map((vehicle) => ({
        id: vehicle.id,
        lineId,
        directionId: vehicle.directionId,
        latitude: vehicle.position.latitude,
        longitude: vehicle.position.longitude,
        progressMinutes: Math.round(vehicle.progressMinutes * 10) / 10,
        sharers: vehicle.sharers,
        updatedAt: new Date(vehicle.updatedAt).toISOString(),
      })),
    };
  }

  /** Nombre de passagers (dont celui-ci) qui partagent la position du même bus (0 si aucun). */
  sharersOnSameVehicle(sessionId: string, now: number): number {
    const sharer = this.sharers.get(sessionId);
    if (!sharer) return 0;
    const vehicle = this.vehicleGroups(sharer.lineId, now).find((group) =>
      group.sessionIds.includes(sessionId),
    );
    return vehicle?.sharers ?? 0;
  }
}
