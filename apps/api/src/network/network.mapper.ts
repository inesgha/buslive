// Conversion des objets Prisma vers les formats de l'API (@buslive/shared).
// On choisit explicitement chaque champ : rien n'est exposé par accident.
import type {
  DirectionSummary,
  GeoPoint,
  Governorate as GovernorateDto,
  Locality as LocalityDto,
  ServiceCalendar as ServiceCalendarDto,
  StopSummary,
} from '@buslive/shared';

import type {
  Governorate,
  LineDirection,
  Locality,
  ServiceCalendar,
  Stop,
} from '../generated/prisma/client';

export function toGovernorate(governorate: Governorate): GovernorateDto {
  return {
    id: governorate.id,
    code: governorate.code,
    nameFr: governorate.nameFr,
    nameAr: governorate.nameAr,
  };
}

function toLocality(locality: Locality | null): LocalityDto | null {
  return locality
    ? { code: locality.code, nameFr: locality.nameFr, nameAr: locality.nameAr }
    : null;
}

export function toStopSummary(stop: Stop & { locality: Locality | null }): StopSummary {
  return {
    id: stop.id,
    code: stop.code,
    nameFr: stop.nameFr,
    nameAr: stop.nameAr,
    latitude: stop.latitude,
    longitude: stop.longitude,
    locality: toLocality(stop.locality),
  };
}

export function toDirectionSummary(direction: LineDirection): DirectionSummary {
  return {
    id: direction.id,
    direction: direction.direction,
    headsignFr: direction.headsignFr,
    headsignAr: direction.headsignAr,
  };
}

/** Date Prisma (@db.Date, minuit UTC) → « AAAA-MM-JJ ». */
function toIsoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function toServiceCalendar(calendar: ServiceCalendar): ServiceCalendarDto {
  return {
    code: calendar.code,
    nameFr: calendar.nameFr,
    nameAr: calendar.nameAr,
    monday: calendar.monday,
    tuesday: calendar.tuesday,
    wednesday: calendar.wednesday,
    thursday: calendar.thursday,
    friday: calendar.friday,
    saturday: calendar.saturday,
    sunday: calendar.sunday,
    startDate: toIsoDate(calendar.startDate),
    endDate: toIsoDate(calendar.endDate),
    priority: calendar.priority,
  };
}

/** Coordonnées GeoJSON [longitude, latitude] → { latitude, longitude }. */
export function toGeoPoints(coordinates: [number, number][] | null): GeoPoint[] | null {
  return coordinates ? coordinates.map(([longitude, latitude]) => ({ latitude, longitude })) : null;
}

/** Tri « naturel » des numéros de ligne : 1, 2, 10, 11 (et non 1, 10, 11, 2). */
export function compareLineCodes(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true });
}
