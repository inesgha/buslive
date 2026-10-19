// Alternatives (louage, covoiturage) et « Partager mon trajet ».
import {
  type GeoPoint,
  type LocalityOption,
  type NearbyLouageStation,
  NearbyLouageStationSchema,
  type RideOfferDetail,
  RideOfferDetailSchema,
  type TripShareCreated,
  type TripStatus,
  TripStatusSchema,
} from '@buslive/shared';
import request from 'supertest';

import { seed } from '../prisma/seed/seed';
import { TripsService } from '../src/trips/trips.service';
import { createTestApp, registerUser, resetDatabase, type TestApp } from './utils';

// Ligne 10 (aller) : gare de Mahdia (0 min) → Rejiche (12) → Ksour Essef station (27) → centre (30).
const gare = { latitude: 35.4978, longitude: 11.0473 };
const rejiche = { latitude: 35.4705, longitude: 11.0336 };
const station = { latitude: 35.4207, longitude: 10.9889 };
const along = (a: GeoPoint, b: GeoPoint, ratio: number): GeoPoint => ({
  latitude: a.latitude + (b.latitude - a.latitude) * ratio,
  longitude: a.longitude + (b.longitude - a.longitude) * ratio,
});
const sample = (point: GeoPoint, secondsAgo: number) => ({
  ...point,
  accuracy: 10,
  recordedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
});

async function waitFor<T>(
  probe: () => Promise<T | null | undefined | false>,
  timeoutMs = 3000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('Délai dépassé');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Alternatives et partage de trajet (e2e)', () => {
  let testApp: TestApp;
  let localities: Record<string, LocalityOption>;
  let line10: { id: string; outbound: string };
  let stops: Record<'rejiche' | 'centre', string>;
  const tokens: Record<string, string> = {};
  const http = () => request(testApp.app.getHttpServer());
  const auth = (user: string) => ({ Authorization: `Bearer ${tokens[user]}` });
  const userId = async (name: string) =>
    (await testApp.prisma.user.findUniqueOrThrow({ where: { email: `${name}@example.tn` } })).id;
  const notificationsOf = async (name: string, type: string) =>
    testApp.prisma.notification.findMany({
      where: { userId: await userId(name), type: type as never },
    });

  /** Départ dans « minutes » minutes. */
  const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

  async function offer(user: string, overrides: object = {}, expected = 201) {
    const response = await http()
      .post('/api/v1/rides')
      .set(auth(user))
      .send({
        fromLocalityId: localities['ksour-essef']!.id,
        toLocalityId: localities.sousse!.id,
        departureAt: inMinutes(120),
        seats: 2,
        priceMillimes: 4000,
        ...overrides,
      })
      .expect(expected);
    if (expected === 201) expect(RideOfferDetailSchema.safeParse(response.body).success).toBe(true);
    return response.body as RideOfferDetail;
  }

  async function detail(user: string, id: string): Promise<RideOfferDetail> {
    const response = await http().get(`/api/v1/rides/${id}`).set(auth(user)).expect(200);
    return response.body as RideOfferDetail;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    await seed(testApp.prisma, { demo: true });

    const list = await http().get('/api/v1/localities').expect(200);
    localities = Object.fromEntries(
      (list.body as LocalityOption[]).map((locality) => [locality.code, locality]),
    );
    const l10 = await testApp.prisma.line.findFirstOrThrow({
      where: { code: '10' },
      include: { directions: true },
    });
    line10 = { id: l10.id, outbound: l10.directions.find((d) => d.direction === 'OUTBOUND')!.id };
    const byCode = async (code: string) =>
      (await testApp.prisma.stop.findUniqueOrThrow({ where: { code } })).id;
    stops = { rejiche: await byCode('rejiche-centre'), centre: await byCode('ksour-essef-centre') };

    for (const name of ['conducteur', 'passager', 'autre', 'sans-tel', 'voyageur']) {
      tokens[name] = await registerUser(testApp, `${name}@example.tn`);
    }
    const phones: Record<string, string> = {
      conducteur: '22 123 456',
      passager: '0021698765432',
      autre: '+216 55 111 222',
    };
    for (const [name, phone] of Object.entries(phones)) {
      await http().patch('/api/v1/me').set(auth(name)).send({ phone }).expect(200);
    }
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('louages', () => {
    it('liste les localités, y compris hors des gouvernorats ouverts', () => {
      expect(localities.sousse).toMatchObject({ nameFr: 'Sousse', governorateCode: 'TN-51' });
    });

    it('trouve les stations proches qui vont à Sousse, la destination en premier', async () => {
      const response = await http()
        .get('/api/v1/louage/stations/nearby')
        .query({ lat: 35.4181, lng: 10.9947, to: localities.sousse!.id })
        .expect(200);
      const found = response.body as NearbyLouageStation[];
      expect(found.every((s) => NearbyLouageStationSchema.safeParse(s).success)).toBe(true);
      expect(found[0]).toMatchObject({ code: 'ksour-essef-louage' });
      expect(found[0]!.distanceMeters).toBeLessThan(500);
      expect(found[0]!.routes[0]).toMatchObject({
        destination: { code: 'sousse' },
        priceMillimes: 5000,
      });
    });

    it('respecte le rayon et refuse une position invalide (400)', async () => {
      const far = await http()
        .get('/api/v1/louage/stations/nearby')
        .query({ lat: 36.8, lng: 10.18, radius: 2000 })
        .expect(200);
      expect(far.body).toEqual([]);
      await http().get('/api/v1/louage/stations/nearby').query({ lat: 200, lng: 10 }).expect(400);
    });
  });

  describe('covoiturage', () => {
    let ride: RideOfferDetail;

    it('exige d’être connecté (401) et d’avoir un téléphone (400)', async () => {
      await http().get('/api/v1/rides').expect(401);
      const response = await http()
        .post('/api/v1/rides')
        .set(auth('sans-tel'))
        .send({
          fromLocalityId: localities['ksour-essef']!.id,
          toLocalityId: localities.sousse!.id,
          departureAt: inMinutes(120),
          seats: 2,
          priceMillimes: 4000,
        })
        .expect(400);
      expect(response.body.message).toContain('téléphone');
    });

    it('refuse un numéro déjà pris par un autre compte (409)', async () => {
      await http()
        .patch('/api/v1/me')
        .set(auth('sans-tel'))
        .send({ phone: '22123456' })
        .expect(409);
    });

    it('publie un trajet ; refuse un départ trop proche (400)', async () => {
      ride = await offer('conducteur');
      expect(ride).toMatchObject({ seats: 2, seatsLeft: 2, mine: true, requests: [] });
      await offer('conducteur', { departureAt: inMinutes(2) }, 400);
    });

    it('limite les trajets en cours par conducteur (409)', async () => {
      await offer('conducteur', { departureAt: inMinutes(180) });
      await offer('conducteur', { departureAt: inMinutes(240) });
      await offer('conducteur', { departureAt: inMinutes(300) }, 409);
    });

    it('trouve les trajets par départ et arrivée, sans aucun téléphone', async () => {
      const response = await http()
        .get('/api/v1/rides')
        .query({ from: localities['ksour-essef']!.id, to: localities.sousse!.id })
        .set(auth('passager'))
        .expect(200);
      expect(response.body).toHaveLength(3);
      expect(JSON.stringify(response.body)).not.toMatch(/\+216/);
      expect(response.body[0]).toMatchObject({ driver: { displayName: 'Passager' }, mine: false });
    });

    it('une demande prévient le conducteur ; personne ne voit encore de numéro', async () => {
      const response = await http()
        .post(`/api/v1/rides/${ride.id}/requests`)
        .set(auth('passager'))
        .send({ seats: 1 })
        .expect(201);
      expect(response.body.myRequest).toMatchObject({ status: 'PENDING', driverPhone: null });
      await waitFor(async () => (await notificationsOf('conducteur', 'RIDE_REQUESTED')).length);

      const driverView = await detail('conducteur', ride.id);
      expect(driverView.requests).toEqual([
        expect.objectContaining({ seats: 1, status: 'PENDING', passengerPhone: null }),
      ]);
    });

    it('interdit de demander une place dans son propre trajet (403) ou deux fois (409)', async () => {
      await http()
        .post(`/api/v1/rides/${ride.id}/requests`)
        .set(auth('conducteur'))
        .send({ seats: 1 })
        .expect(403);
      await http()
        .post(`/api/v1/rides/${ride.id}/requests`)
        .set(auth('passager'))
        .send({ seats: 1 })
        .expect(409);
    });

    it('après acceptation, SEULS le conducteur et le passager voient le numéro de l’autre', async () => {
      const requestId = (await detail('conducteur', ride.id)).requests[0]!.id;
      const accepted = await http()
        .post(`/api/v1/rides/${ride.id}/requests/${requestId}/accept`)
        .set(auth('conducteur'))
        .expect(200);
      expect(accepted.body.requests[0]).toMatchObject({
        status: 'ACCEPTED',
        passengerPhone: '+21698765432',
      });
      expect(accepted.body.seatsLeft).toBe(1);
      await waitFor(async () => (await notificationsOf('passager', 'RIDE_ACCEPTED')).length);

      expect((await detail('passager', ride.id)).myRequest).toMatchObject({
        status: 'ACCEPTED',
        driverPhone: '+21622123456',
      });
      const stranger = await detail('autre', ride.id);
      expect(stranger).toMatchObject({ myRequest: null, requests: [] });
      expect(JSON.stringify(stranger)).not.toMatch(/\+216/);
    });

    it('refuse une demande qui dépasse les places libres (409)', async () => {
      await http()
        .post(`/api/v1/rides/${ride.id}/requests`)
        .set(auth('autre'))
        .send({ seats: 2 })
        .expect(409);
    });

    it('deux acceptations simultanées ne dépassent jamais les places', async () => {
      const single = await offer('autre', { seats: 1, departureAt: inMinutes(90) });
      for (const name of ['passager', 'voyageur']) {
        if (name === 'voyageur') {
          await http()
            .patch('/api/v1/me')
            .set(auth(name))
            .send({ phone: '29 000 111' })
            .expect(200);
        }
        await http()
          .post(`/api/v1/rides/${single.id}/requests`)
          .set(auth(name))
          .send({ seats: 1 })
          .expect(201);
      }
      const requests = (await detail('autre', single.id)).requests;
      const results = await Promise.all(
        requests.map((r) =>
          http().post(`/api/v1/rides/${single.id}/requests/${r.id}/accept`).set(auth('autre')),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await detail('autre', single.id)).seatsLeft).toBe(0);
    });

    it('un refus est définitif pour ce trajet', async () => {
      const other = await offer('autre', { departureAt: inMinutes(150) });
      await http()
        .post(`/api/v1/rides/${other.id}/requests`)
        .set(auth('passager'))
        .send({ seats: 1 })
        .expect(201);
      const requestId = (await detail('autre', other.id)).requests[0]!.id;
      await http()
        .post(`/api/v1/rides/${other.id}/requests/${requestId}/decline`)
        .set(auth('autre'))
        .expect(200);
      await waitFor(async () => (await notificationsOf('passager', 'RIDE_DECLINED')).length);
      await http()
        .post(`/api/v1/rides/${other.id}/requests`)
        .set(auth('passager'))
        .send({ seats: 1 })
        .expect(409);
    });

    it('le conducteur annule : les passagers sont prévenus et les numéros disparaissent', async () => {
      const cancelled = await http()
        .post(`/api/v1/rides/${ride.id}/cancel`)
        .set(auth('conducteur'))
        .expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      await waitFor(async () => (await notificationsOf('passager', 'RIDE_CANCELLED')).length);
      expect((await detail('passager', ride.id)).myRequest?.driverPhone).toBeNull();
      // Un trajet annulé n'apparaît plus dans la recherche.
      const search = await http().get('/api/v1/rides').set(auth('passager')).expect(200);
      expect((search.body as { id: string }[]).map((r) => r.id)).not.toContain(ride.id);
    });

    it('signaler une annonce (une fois), mais pas la sienne (403)', async () => {
      const target = (await http().get('/api/v1/me/rides').set(auth('autre')).expect(200)).body
        .offers[0] as RideOfferDetail;
      for (let i = 0; i < 2; i++) {
        await http()
          .post(`/api/v1/rides/${target.id}/flags`)
          .set(auth('passager'))
          .send({ reason: 'FAKE' })
          .expect(204);
      }
      expect(await testApp.prisma.rideFlag.count({ where: { offerId: target.id } })).toBe(1);
      await http()
        .post(`/api/v1/rides/${target.id}/flags`)
        .set(auth('autre'))
        .send({ reason: 'FAKE' })
        .expect(403);
    });
  });

  describe('Partager mon trajet', () => {
    let sessionId: string;
    let toCentre: TripShareCreated;
    let toRejiche: TripShareCreated;
    const token = (share: TripShareCreated) => share.path.split('/').pop()!;
    const status = async (share: TripShareCreated, expected = 200) =>
      (
        await http()
          .get(`/api/v1/trips/${token(share)}`)
          .expect(expected)
      ).body as TripStatus;

    beforeAll(async () => {
      const session = await http()
        .post('/api/v1/live/sessions')
        .set(auth('voyageur'))
        .send({ lineId: line10.id, directionId: line10.outbound })
        .expect(201);
      sessionId = session.body.id;
      // Bus à mi-chemin entre la gare (0 min) et Rejiche (12 min).
      await http()
        .post(`/api/v1/live/sessions/${sessionId}/positions`)
        .set(auth('voyageur'))
        .send({
          points: [sample(along(gare, rejiche, 0.45), 100), sample(along(gare, rejiche, 0.5), 90)],
        })
        .expect(200);
    });

    it('crée un lien pour son propre partage seulement', async () => {
      await http()
        .post('/api/v1/trips')
        .set(auth('autre'))
        .send({ sessionId, destinationStopId: stops.centre })
        .expect(404);
      const response = await http()
        .post('/api/v1/trips')
        .set(auth('voyageur'))
        .send({ sessionId, destinationStopId: stops.centre })
        .expect(201);
      toCentre = response.body as TripShareCreated;
      expect(toCentre.path).toMatch(/^\/t\/[A-Za-z0-9_-]{32}$/);
      // Le jeton n'est jamais stocké tel quel.
      const stored = await testApp.prisma.tripShare.findUniqueOrThrow({
        where: { id: toCentre.id },
      });
      expect(stored.tokenHash).not.toContain(token(toCentre));
    });

    it('la page web est servie hors de /api/v1, sans script intégré (CSP)', async () => {
      const page = await http().get(toCentre.path).expect(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.headers['content-security-policy']).toContain("script-src 'self'");
      expect(page.headers['cache-control']).toBe('no-store');
      expect(page.text).toContain('<script src="/t/assets/trip.js"></script>');
      await http()
        .get('/t/assets/trip.js')
        .expect(200)
        .expect('Content-Type', /javascript/);
    });

    it('montre l’avancée du bus et l’arrivée estimée, SANS donnée personnelle', async () => {
      const trip = await status(toCentre);
      expect(TripStatusSchema.safeParse(trip).success).toBe(true);
      expect(trip).toMatchObject({ status: 'LIVE', line: { code: '10' } });
      expect(trip.stops.map((s) => s.passed)).toEqual([true, false, false, false]);
      expect(trip.etaMinutes).toBeGreaterThanOrEqual(22);
      expect(trip.etaMinutes).toBeLessThanOrEqual(26);
      const raw = JSON.stringify(trip);
      for (const secret of ['voyageur', 'Passager', '@example.tn', String(gare.latitude)]) {
        expect(raw).not.toContain(secret);
      }
    });

    it('passe à « arrivé » quand le bus dépasse l’arrêt de descente', async () => {
      toRejiche = (
        await http()
          .post('/api/v1/trips')
          .set(auth('voyageur'))
          .send({ sessionId, destinationStopId: stops.rejiche })
          .expect(201)
      ).body as TripShareCreated;
      await http()
        .post(`/api/v1/live/sessions/${sessionId}/positions`)
        .set(auth('voyageur'))
        .send({ points: [sample(along(rejiche, station, 0.05), 10)] })
        .expect(200);
      const arrived = await waitFor(async () => {
        const trip = await status(toRejiche);
        return trip.status === 'ARRIVED' ? trip : null;
      });
      expect(arrived.etaMinutes).toBeNull();
      expect(arrived.stops.every((s) => s.passed)).toBe(true);
    });

    it('fin du partage : « terminé », puis le lien expire 15 min plus tard', async () => {
      await http().delete(`/api/v1/live/sessions/${sessionId}`).set(auth('voyageur')).expect(200);
      expect((await status(toCentre)).status).toBe('ENDED');
      const service = testApp.app.get(TripsService);
      await expect(
        service.status(token(toCentre), new Date(Date.now() + 16 * 60_000)),
      ).rejects.toThrow('expiré');
    });

    it('un lien désactivé, inconnu ou mal formé ne donne rien', async () => {
      await http().delete(`/api/v1/trips/${toRejiche.id}`).set(auth('autre')).expect(404);
      await http().delete(`/api/v1/trips/${toRejiche.id}`).set(auth('voyageur')).expect(204);
      await status(toRejiche, 404);
      await http()
        .get(`/api/v1/trips/${'x'.repeat(32)}`)
        .expect(404);
      await http().get('/api/v1/trips/trop-court').expect(400);
      await http().get('/t/trop-court').expect(400);
    });
  });
});
