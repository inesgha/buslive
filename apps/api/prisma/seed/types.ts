// Formats des fichiers de données du seed (prisma/seed/data/).

export interface GovernorateData {
  /** Code ISO 3166-2, ex. « TN-53 ». */
  code: string;
  nameFr: string;
  nameAr: string;
  /** Valeur initiale seulement : relancer le seed ne modifie pas un gouvernorat déjà activé/désactivé. */
  isActive: boolean;
}

export interface LocalityData {
  code: string;
  governorateCode: string;
  nameFr: string;
  nameAr: string;
}

export interface StopData {
  code: string;
  localityCode: string;
  nameFr: string;
  nameAr: string;
  latitude: number;
  longitude: number;
}

export type Weekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface CalendarData {
  code: string;
  nameFr: string;
  nameAr: string;
  days: Weekday[];
  /** « AAAA-MM-JJ » ou null. */
  startDate: string | null;
  endDate: string | null;
  priority: number;
}

/** Départs par code de calendrier, en minutes depuis minuit. */
export type DeparturesByCalendar = Record<string, number[]>;

export interface LineData {
  code: string;
  nameFr: string;
  nameAr: string;
  type: 'URBAN' | 'SUBURBAN' | 'INTERCITY';
  color: string;
  outbound: {
    headsignFr: string;
    headsignAr: string;
    /** [code de l'arrêt, minutes depuis le départ], dans l'ordre du parcours. */
    stops: [stopCode: string, minutesFromStart: number][];
    departures: DeparturesByCalendar;
  };
  /** Le retour parcourt les mêmes arrêts en sens inverse (temps recalculés). */
  inbound: {
    headsignFr: string;
    headsignAr: string;
    departures: DeparturesByCalendar;
  };
}
