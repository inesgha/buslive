import { isStationOpen } from './louage';
import { formatMillimes } from './money';
import { type NotificationContent, notificationUrl, renderNotification } from './notifications';
import { CreateRideOfferSchema, isRideOpen, RIDE_RULES, seatsLeft } from './rides';
import { tripShareExpiry, TRIP_SHARE_RULES } from './trips';

const from = '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d';
const to = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('formatMillimes', () => {
  it('écrit les dinars avec trois décimales', () => {
    expect(formatMillimes(3500, 'fr')).toBe('3,500 DT');
    expect(formatMillimes(12_000, 'fr')).toBe('12,000 DT');
    expect(formatMillimes(450, 'ar')).toBe('0,450 د.ت');
  });
});

describe('isStationOpen', () => {
  const station = { openingMinutes: 5 * 60, closingMinutes: 20 * 60 };
  it('compare à l’heure de Tunis, et ne devine pas des horaires inconnus', () => {
    expect(isStationOpen(station, { isoDate: '2026-10-19', minutes: 6 * 60 })).toBe(true);
    expect(isStationOpen(station, { isoDate: '2026-10-19', minutes: 21 * 60 })).toBe(false);
    expect(
      isStationOpen(
        { openingMinutes: null, closingMinutes: null },
        { isoDate: '2026-10-19', minutes: 0 },
      ),
    ).toBeNull();
  });
});

describe('covoiturage', () => {
  const offer = {
    fromLocalityId: from,
    toLocalityId: to,
    departureAt: '2026-10-19T07:30:00+01:00',
    seats: 3,
    priceMillimes: 2500,
  };

  it('valide une annonce', () => {
    expect(CreateRideOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('refuse un trajet vers le même endroit, trop de places, un prix au millime près', () => {
    expect(CreateRideOfferSchema.safeParse({ ...offer, toLocalityId: from }).success).toBe(false);
    expect(
      CreateRideOfferSchema.safeParse({ ...offer, seats: RIDE_RULES.maxSeats + 1 }).success,
    ).toBe(false);
    expect(CreateRideOfferSchema.safeParse({ ...offer, priceMillimes: 2550 }).success).toBe(false);
  });

  it('compte les places libres et ferme une annonce passée ou annulée', () => {
    expect(seatsLeft(3, 2)).toBe(1);
    expect(seatsLeft(3, 5)).toBe(0);
    const now = new Date('2026-10-19T06:00:00Z');
    expect(isRideOpen({ status: 'ACTIVE', departureAt: '2026-10-19T07:00:00Z' }, now)).toBe(true);
    expect(isRideOpen({ status: 'ACTIVE', departureAt: '2026-10-19T05:00:00Z' }, now)).toBe(false);
    expect(isRideOpen({ status: 'CANCELLED', departureAt: '2026-10-19T07:00:00Z' }, now)).toBe(
      false,
    );
  });
});

describe('notifications de covoiturage', () => {
  const content: NotificationContent = {
    type: 'RIDE_ACCEPTED',
    data: {
      offerId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
      fromNameFr: 'Ksour Essef',
      fromNameAr: 'قصور الساف',
      toNameFr: 'Sousse',
      toNameAr: 'سوسة',
      // 06:30 UTC = 07:30 à Tunis.
      departureAt: '2026-10-19T06:30:00.000Z',
      seats: 2,
    },
  };

  it('donne le trajet et l’heure de Tunis, dans les deux langues', () => {
    expect(renderNotification(content, 'fr').body).toBe(
      'Le conducteur a accepté ta demande pour Ksour Essef → Sousse, le 19/10 à 07:30. Son numéro est dans l’app.',
    );
    const ar = renderNotification(content, 'ar').body;
    expect(ar).toContain('من قصور الساف إلى سوسة');
    expect(ar).toContain('07:30');
    expect(renderNotification({ ...content, type: 'RIDE_REQUESTED' }, 'ar').body).toContain(
      'مقعدين',
    );
  });

  it('ouvre l’annonce concernée', () => {
    expect(notificationUrl(content)).toBe(`/rides/${content.data.offerId}`);
  });
});

describe('tripShareExpiry', () => {
  const created = new Date('2026-10-19T06:00:00Z');
  it('3 h au plus, ou 15 min après la fin du partage', () => {
    expect(tripShareExpiry(created, null).toISOString()).toBe('2026-10-19T09:00:00.000Z');
    expect(tripShareExpiry(created, new Date('2026-10-19T06:40:00Z')).toISOString()).toBe(
      '2026-10-19T06:55:00.000Z',
    );
    expect(TRIP_SHARE_RULES.maxHours).toBe(3);
  });
});
