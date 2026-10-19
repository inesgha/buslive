import {
  addDays,
  type CreateRideOfferInput,
  CreateRideOfferSchema,
  MINUTES_PER_DAY,
  minutesToTime,
  RIDE_RULES,
  type ServiceClock,
} from '@buslive/shared';

/**
 * Logique du formulaire « Proposer un trajet », sans interface (testable).
 * Les heures sont saisies en heure de Tunis, quel que soit le fuseau du téléphone.
 */

export interface RideDraft {
  fromLocalityId?: string;
  toLocalityId?: string;
  /** 0 = aujourd'hui, 1 = demain… (7 jours au plus). */
  dayOffset: number;
  /** Heure de départ, minutes depuis minuit (heure de Tunis). */
  departureMinutes: number;
  seats: number;
  priceMillimes: number;
}

export const DEPARTURE_STEP_MINUTES = 15;
/** Le prix se règle de 500 en 500 millimes (0,500 DT). */
export const PRICE_STEP_MILLIMES = 500;

/** Départ proposé : dans environ 1 h, arrondi au quart d'heure (demain s'il est tard). */
export function defaultRideDraft(clock: ServiceClock): RideDraft {
  const minutes = Math.ceil((clock.minutes + 60) / DEPARTURE_STEP_MINUTES) * DEPARTURE_STEP_MINUTES;
  return {
    dayOffset: minutes >= MINUTES_PER_DAY ? 1 : 0,
    departureMinutes: minutes % MINUTES_PER_DAY,
    seats: 3,
    priceMillimes: 3000,
  };
}

/** Les 7 jours proposés : date « AAAA-MM-JJ » de chacun. */
export function rideDays(clock: ServiceClock): { offset: number; isoDate: string }[] {
  return Array.from({ length: RIDE_RULES.maxDaysAhead }, (_, offset) => ({
    offset,
    isoDate: addDays(clock.isoDate, offset),
  }));
}

/**
 * Date et heure de Tunis → ISO 8601 avec le décalage de Tunis (+01:00 : pas
 * d'heure d'été en Tunisie depuis 2009). L'API reçoit ainsi l'instant exact.
 */
export function departureIso(clock: ServiceClock, dayOffset: number, minutes: number): string {
  return `${addDays(clock.isoDate, dayOffset)}T${minutesToTime(minutes)}:00+01:00`;
}

export function shiftDeparture(draft: RideDraft, steps: number): RideDraft {
  const minutes = draft.departureMinutes + steps * DEPARTURE_STEP_MINUTES;
  return {
    ...draft,
    departureMinutes: Math.min(MINUTES_PER_DAY - DEPARTURE_STEP_MINUTES, Math.max(0, minutes)),
  };
}

export function shiftPrice(draft: RideDraft, steps: number): RideDraft {
  const price = draft.priceMillimes + steps * PRICE_STEP_MILLIMES;
  return { ...draft, priceMillimes: Math.min(RIDE_RULES.maxPriceMillimes, Math.max(0, price)) };
}

/** Brouillon → corps de POST /rides, ou null s'il manque quelque chose. */
export function buildRideInput(draft: RideDraft, clock: ServiceClock): CreateRideOfferInput | null {
  const parsed = CreateRideOfferSchema.safeParse({
    fromLocalityId: draft.fromLocalityId,
    toLocalityId: draft.toLocalityId,
    departureAt: departureIso(clock, draft.dayOffset, draft.departureMinutes),
    seats: draft.seats,
    priceMillimes: draft.priceMillimes,
  });
  return parsed.success ? parsed.data : null;
}
