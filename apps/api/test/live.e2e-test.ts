// « Je suis dans le bus » : partage de position, bus en direct et Socket.io.
import type { AddressInfo } from 'node:net';

import {
  type GeoPoint,
  LIVE_EVENTS,
  type LineVehicles,
  LineVehiclesSchema,
  type LiveSession,
  type PositionBatchResult,
  PositionBatchResultSchema,
  type StopDepartures,
} from '@buslive/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import { seed } from '../prisma/seed/seed';
import { LiveService } from '../src/live/live.service';
import { createTestApp, registerUser, resetDatabase, type TestApp } from './utils';

// Tracé de démonstration de la ligne 10 (aller) : gare → Rejiche → Ksour Essef.
const gare = { latitude: 35.4978, longitude: 11.0473 };
const rejiche = { latitude: 35.4705, longitude: 11.0336 };
const station = { latitude: 35.4207, longitude: 10.9889 };
const centre = { latitude: 35.4181, longitude: 10.9947 };
const lycee = { latitude: 35.4149, longitude: 11.0012 };

/** Point à « ratio » du segment [a, b]. */
const along = (a: GeoPoint, b: GeoPoint, ratio: number): GeoPoint => ({
  latitude: a.latitude + (b.latitude - a.latitude) * ratio,
  longitude: a.longitude + (b.longitude - a.longitude) * ratio,
});

/** Position mesurée il y a « secondsAgo » secondes. */
const sample = (point: GeoPoint, secondsAgo: number, accuracy = 10) => ({
  ...point,
  accuracy,
  recordedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
});

describe('Temps réel (e2e)', () => {
  let testApp: TestApp;
  let line10: { id: string; outbound: string };
  let line1Direction: string;
  const tokens: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };
  const sessions: Record<string, LiveSession> = {};
  const http = () => request(testApp.app.getHttpServer());

  async function start(user: keyof typeof tokens, lineId: string, directionId: string) {
    const response = await http()
      .post('/api/v1/live/sessions')
      .set('Authorization', `Bearer ${tokens[user]}`)
      .send({ lineId, directionId })
      .expect(201);
    return response.body as LiveSession;
  }

  async function send(user: keyof typeof tokens, sessionId: string, points: object[]) {
    const response = await http()
      .post(`/api/v1/live/sessions/${sessionId}/positions`)
      .set('Authorization', `Bearer ${tokens[user]}`)
      .send({ points })
      .expect(200);
    expect(PositionBatchResultSchema.safeParse(response.body).success).toBe(true);
    return response.body as PositionBatchResult;
  }

  async function vehicles(): Promise<LineVehicles> {
    const response = await http().get(`/api/v1/live/lines/${line10.id}/vehicles`).expect(200);
    expect(LineVehiclesSchema.safeParse(response.body).success).toBe(true);
    return response.body as LineVehicles;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    // Écoute sur un port réel : nécessaire pour le client Socket.io.
    await testApp.app.listen(0);
    await resetDatabase(testApp.prisma);
    await seed(testApp.prisma, { demo: true });

    const lines = await testApp.prisma.line.findMany({ include: { directions: true } });
    const l10 = lines.find((l) => l.code === '10')!;
    line10 = { id: l10.id, outbound: l10.directions.find((d) => d.direction === 'OUTBOUND')!.id };
    line1Direction = lines.find((l) => l.code === '1')!.directions[0]!.id;

    tokens.a = await registerUser(testApp, 'a@example.tn');
    tokens.b = await registerUser(testApp, 'b@example.tn');
    tokens.c = await registerUser(testApp, 'c@example.tn');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('démarrer un partage', () => {
    it('exige d’être connecté (401)', async () => {
      await http()
        .post('/api/v1/live/sessions')
        .send({ lineId: line10.id, directionId: line10.outbound })
        .expect(401);
    });

    it('refuse un sens qui n’appartient pas à la ligne (404)', async () => {
      await http()
        .post('/api/v1/live/sessions')
        .set('Authorization', `Bearer ${tokens.a}`)
        .send({ lineId: line10.id, directionId: line1Direction })
        .expect(404);
    });

    it('démarre un partage sur la ligne 10, vers Ksour Essef', async () => {
      sessions.a = await start('a', line10.id, line10.outbound);
      expect(sessions.a).toMatchObject({ status: 'ACTIVE', endReason: null, lineId: line10.id });
    });
  });

  describe('positions', () => {
    it('ignore une position hors du parcours ou trop imprécise', async () => {
      const result = await send('a', sessions.a!.id, [
        sample({ latitude: 36.8065, longitude: 10.1815 }, 120), // Tunis
        sample(along(gare, rejiche, 0.05), 110, 500), // précision de 500 m
      ]);
      expect(result).toMatchObject({ accepted: 0, rejected: 2 });
      expect((await vehicles()).vehicles).toEqual([]);
    });

    it('accepte des positions plausibles sur le parcours : un bus apparaît', async () => {
      const result = await send('a', sessions.a!.id, [
        sample(along(gare, rejiche, 0.1), 90),
        sample(along(gare, rejiche, 0.2), 60),
      ]);
      expect(result).toMatchObject({
        accepted: 2,
        rejected: 0,
        onRoute: true,
        sharersOnVehicle: 1,
      });

      const [vehicle, ...others] = (await vehicles()).vehicles;
      expect(others).toHaveLength(0);
      // 20 % du trajet gare → Rejiche (12 min) ≈ 2,4 min depuis le terminus.
      expect(vehicle?.progressMinutes).toBeCloseTo(2.4, 0);
      expect(vehicle).toMatchObject({ directionId: line10.outbound, sharers: 1 });
    });

    it('refuse une position trop rapprochée (< 5 s) et un saut impossible', async () => {
      const result = await send('a', sessions.a!.id, [
        sample(along(gare, rejiche, 0.21), 58), // 2 s après la précédente
        sample(station, 50), // ~6 km en 10 s
      ]);
      expect(result).toMatchObject({ accepted: 0, rejected: 2 });
    });

    it('regroupe deux passagers du même bus', async () => {
      sessions.b = await start('b', line10.id, line10.outbound);
      const result = await send('b', sessions.b.id, [sample(along(gare, rejiche, 0.205), 55)]);
      expect(result.sharersOnVehicle).toBe(2);
      expect((await vehicles()).vehicles.map((v) => v.sharers)).toEqual([2]);
    });

    it('annonce le bus en direct à l’arrêt suivant (Rejiche)', async () => {
      const stop = await testApp.prisma.stop.findUniqueOrThrow({
        where: { code: 'rejiche-centre' },
      });
      const response = await http().get(`/api/v1/stops/${stop.id}/departures`).expect(200);
      const { liveArrivals } = response.body as StopDepartures;
      expect(liveArrivals).toHaveLength(1);
      expect(liveArrivals[0]).toMatchObject({
        line: { code: '10' },
        direction: { direction: 'OUTBOUND' },
      });
      expect(liveArrivals[0]!.etaMinutes).toBeGreaterThanOrEqual(8);
      expect(liveArrivals[0]!.etaMinutes).toBeLessThanOrEqual(11);
    });

    it('refuse un lot trop grand ou mal formé (400)', async () => {
      const tooMany = Array.from({ length: 21 }, (_, i) =>
        sample(along(gare, rejiche, 0.3), 40 - i),
      );
      await http()
        .post(`/api/v1/live/sessions/${sessions.a!.id}/positions`)
        .set('Authorization', `Bearer ${tokens.a}`)
        .send({ points: tooMany })
        .expect(400);
      await http()
        .post(`/api/v1/live/sessions/${sessions.a!.id}/positions`)
        .set('Authorization', `Bearer ${tokens.a}`)
        .send({ points: [{ latitude: 'x' }] })
        .expect(400);
    });

    it('ne laisse pas un autre utilisateur écrire dans le partage (404)', async () => {
      await http()
        .post(`/api/v1/live/sessions/${sessions.a!.id}/positions`)
        .set('Authorization', `Bearer ${tokens.c}`)
        .send({ points: [sample(along(gare, rejiche, 0.3), 30)] })
        .expect(404);
    });
  });

  describe('Socket.io (spectateurs)', () => {
    let socket: Socket;

    beforeAll(async () => {
      const { port } = testApp.app.getHttpServer().address() as AddressInfo;
      socket = io(`http://127.0.0.1:${port}/live`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    });

    afterAll(() => {
      socket.close();
    });

    /** Attend le prochain message « vehicles » qui vérifie la condition. */
    function nextVehicles(predicate: (payload: LineVehicles) => boolean): Promise<LineVehicles> {
      return new Promise((resolve) => {
        const listener = (payload: LineVehicles) => {
          if (!predicate(payload)) return;
          socket.off(LIVE_EVENTS.vehicles, listener);
          resolve(payload);
        };
        socket.on(LIVE_EVENTS.vehicles, listener);
      });
    }

    it('envoie l’état actuel dès qu’on suit une ligne', async () => {
      const initial = nextVehicles(() => true);
      const ack = await socket.emitWithAck(LIVE_EVENTS.watchLine, { lineId: line10.id });
      expect(ack).toEqual({ ok: true });
      expect((await initial).vehicles.map((v) => v.sharers)).toEqual([2]);
    });

    it('refuse une demande mal formée', async () => {
      expect(await socket.emitWithAck(LIVE_EVENTS.watchLine, { lineId: 'pas-un-uuid' })).toEqual({
        ok: false,
      });
    });

    it('diffuse les mouvements : le passager A s’éloigne, deux bus distincts', async () => {
      const update = nextVehicles((payload) => payload.vehicles.length === 2);
      await send('a', sessions.a!.id, [sample(along(gare, rejiche, 0.3), 30)]);
      const payload = await update;
      expect(payload.lineId).toBe(line10.id);
      expect(payload.vehicles.map((v) => v.sharers)).toEqual([1, 1]);
      // Aucune information sur les passagers n'est diffusée.
      expect(Object.keys(payload.vehicles[0]!).sort()).toEqual([
        'directionId',
        'id',
        'latitude',
        'lineId',
        'longitude',
        'progressMinutes',
        'sharers',
        'updatedAt',
      ]);
    });

    it('retire le bus quand le passager arrête de partager', async () => {
      const update = nextVehicles((payload) => payload.vehicles.length === 1);
      const response = await http()
        .delete(`/api/v1/live/sessions/${sessions.a!.id}`)
        .set('Authorization', `Bearer ${tokens.a}`)
        .expect(200);
      expect(response.body).toMatchObject({ status: 'ENDED', endReason: 'USER' });
      await update;
    });
  });

  describe('fin des partages', () => {
    it('signale à l’app qu’un partage est terminé', async () => {
      const result = await send('a', sessions.a!.id, [sample(along(gare, rejiche, 0.4), 20)]);
      expect(result).toMatchObject({ accepted: 0, session: { status: 'ENDED' } });
    });

    it('un nouveau partage remplace le précédent', async () => {
      const replacement = await start('b', line10.id, line10.outbound);
      const previous = await testApp.prisma.liveSession.findUniqueOrThrow({
        where: { id: sessions.b!.id },
      });
      expect(previous).toMatchObject({ status: 'ENDED', endReason: 'REPLACED' });
      sessions.b = replacement;
    });

    it('s’arrête tout seul à l’arrivée au terminus', async () => {
      sessions.c = await start('c', line10.id, line10.outbound);
      const result = await send('c', sessions.c.id, [
        sample(along(station, centre, 0.5), 120),
        sample(lycee, 60),
      ]);
      expect(result.accepted).toBe(2);
      expect(result.session).toMatchObject({ status: 'ENDED', endReason: 'TERMINUS' });
    });

    it('clôt les partages restés sans position', async () => {
      await testApp.app.get(LiveService).sweep(Date.now() + 11 * 60 * 1000);
      const session = await testApp.prisma.liveSession.findUniqueOrThrow({
        where: { id: sessions.b!.id },
      });
      expect(session).toMatchObject({ status: 'ENDED', endReason: 'INACTIVE' });
      expect((await vehicles()).vehicles).toEqual([]);
    });

    it('ne garde en base que la dernière position, pas le trajet', async () => {
      const columns = await testApp.prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'live_sessions'
      `;
      const names = columns.map((c) => c.column_name);
      expect(names).toEqual(expect.arrayContaining(['last_latitude', 'last_longitude']));
      const positionTables = await testApp.prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name ILIKE '%position%'
      `;
      expect(positionTables).toEqual([]);
    });
  });
});
