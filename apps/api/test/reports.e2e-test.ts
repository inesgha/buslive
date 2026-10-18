// Signalements, votes, confiance, preuves automatiques et statistiques.
import type { AddressInfo } from 'node:net';

import {
  type GeoPoint,
  LIVE_EVENTS,
  type LineReportEvent,
  LineStatsSchema,
  type Report,
  ReportSchema,
  type StopDepartures,
  type TrustSummary,
  TRUST_RULES,
  tunisClock,
} from '@buslive/shared';
import { io } from 'socket.io-client';
import request from 'supertest';

import { seed } from '../prisma/seed/seed';
import { ReportsService } from '../src/reports/reports.service';
import { TrustService } from '../src/reports/trust.service';
import { createTestApp, registerUser, resetDatabase, type TestApp } from './utils';

// Ligne 10 (aller) : gare de Mahdia → Rejiche → Ksour Essef.
const gare = { latitude: 35.4978, longitude: 11.0473 };
const rejiche = { latitude: 35.4705, longitude: 11.0336 };
const station = { latitude: 35.4207, longitude: 10.9889 };
const along = (a: GeoPoint, b: GeoPoint, ratio: number): GeoPoint => ({
  latitude: a.latitude + (b.latitude - a.latitude) * ratio,
  longitude: a.longitude + (b.longitude - a.longitude) * ratio,
});

/** Attend qu'une condition devienne vraie (traitements asynchrones de l'API). */
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

describe('Signalements (e2e)', () => {
  let testApp: TestApp;
  let line10: { id: string; outbound: string };
  let line1: { id: string; direction: string };
  let stops: Record<'centre' | 'rejiche' | 'cap', string>;
  const tokens: Record<string, string> = {};
  const http = () => request(testApp.app.getHttpServer());

  const userId = async (name: string) =>
    (await testApp.prisma.user.findUniqueOrThrow({ where: { email: `${name}@example.tn` } })).id;
  const score = async (name: string) =>
    (await testApp.prisma.user.findUniqueOrThrow({ where: { email: `${name}@example.tn` } }))
      .trustScore;

  async function report(user: string, body: object, expected = 201): Promise<Report> {
    const response = await http()
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokens[user]}`)
      .send(body)
      .expect(expected);
    if (expected === 201) expect(ReportSchema.safeParse(response.body).success).toBe(true);
    return response.body as Report;
  }

  async function vote(user: string, reportId: string, value: 'CONFIRM' | 'DENY', expected = 201) {
    const response = await http()
      .post(`/api/v1/reports/${reportId}/votes`)
      .set('Authorization', `Bearer ${tokens[user]}`)
      .send({ value })
      .expect(expected);
    return response.body as Report;
  }

  /** Horaire concerné « il y a N minutes » (heure de Tunis). */
  const scheduledMinutesAgo = (minutes: number) => {
    const clock = tunisClock(new Date(Date.now() - minutes * 60_000));
    return { serviceDate: clock.isoDate, scheduledMinutes: clock.minutes };
  };

  beforeAll(async () => {
    testApp = await createTestApp();
    await testApp.app.listen(0);
    await resetDatabase(testApp.prisma);
    await seed(testApp.prisma, { demo: true });

    const lines = await testApp.prisma.line.findMany({ include: { directions: true } });
    const l10 = lines.find((l) => l.code === '10')!;
    const l1 = lines.find((l) => l.code === '1')!;
    line10 = { id: l10.id, outbound: l10.directions.find((d) => d.direction === 'OUTBOUND')!.id };
    line1 = { id: l1.id, direction: l1.directions[0]!.id };
    const byCode = async (code: string) =>
      (await testApp.prisma.stop.findUniqueOrThrow({ where: { code } })).id;
    stops = {
      centre: await byCode('ksour-essef-centre'),
      rejiche: await byCode('rejiche-centre'),
      cap: await byCode('mahdia-cap-afrique'),
    };

    for (const name of [
      'auteur',
      'b',
      'c',
      'd',
      'r',
      'expert',
      'faible',
      'h',
      's',
      'u',
      'passager',
    ]) {
      tokens[name] = await registerUser(testApp, `${name}@example.tn`);
    }
    await testApp.prisma.user.update({
      where: { email: 'expert@example.tn' },
      data: { trustScore: 100 },
    });
    await testApp.prisma.user.update({
      where: { email: 'faible@example.tn' },
      data: { trustScore: -60 },
    });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  let notCame: Report;

  describe('créer un signalement', () => {
    it('exige d’être connecté (401)', async () => {
      await http().post('/api/v1/reports').send({ type: 'FULL', lineId: line10.id }).expect(401);
    });

    it('refuse un « pas venu » sans arrêt (400)', async () => {
      await report(
        'auteur',
        { type: 'NOT_CAME', lineId: line10.id, directionId: line10.outbound },
        400,
      );
    });

    it('refuse un arrêt qui n’est pas sur ce sens (404)', async () => {
      await report(
        'auteur',
        { type: 'NOT_CAME', lineId: line10.id, directionId: line10.outbound, stopId: stops.cap },
        404,
      );
    });

    it('refuse un horaire trop éloigné (400)', async () => {
      await report(
        'auteur',
        {
          type: 'NOT_CAME',
          lineId: line10.id,
          directionId: line10.outbound,
          stopId: stops.centre,
          ...scheduledMinutesAgo(300),
        },
        400,
      );
    });

    it('crée un « pas venu » pour le bus d’il y a 10 min', async () => {
      notCame = await report('auteur', {
        type: 'NOT_CAME',
        lineId: line10.id,
        directionId: line10.outbound,
        stopId: stops.centre,
        ...scheduledMinutesAgo(10),
        position: { latitude: 35.4182, longitude: 10.9948, accuracy: 10 },
      });
      expect(notCame).toMatchObject({
        status: 'ACTIVE',
        mine: true,
        myVote: null,
        confirmations: 0,
      });
      // Seule la distance à l'arrêt est gardée, pas la position de l'auteur.
      const stored = await testApp.prisma.report.findUniqueOrThrow({ where: { id: notCame.id } });
      expect(stored.reporterDistanceMeters).toBeLessThan(30);
    });

    it('apparaît dans la liste publique, sans information sur l’auteur', async () => {
      const response = await http().get(`/api/v1/lines/${line10.id}/reports`).expect(200);
      const [listed] = response.body as Report[];
      expect(listed).toMatchObject({ id: notCame.id, mine: false, myVote: null });
      expect(listed).not.toHaveProperty('userId');
    });
  });

  describe('votes et confiance', () => {
    it('interdit de voter pour son propre signalement (403)', async () => {
      await vote('auteur', notCame.id, 'CONFIRM', 403);
    });

    it('une confirmation ne suffit pas, et on ne vote qu’une fois (409)', async () => {
      const afterB = await vote('b', notCame.id, 'CONFIRM');
      expect(afterB).toMatchObject({ status: 'ACTIVE', confirmations: 1, myVote: 'CONFIRM' });
      await vote('b', notCame.id, 'CONFIRM', 409);
    });

    it('confirmé à partir d’un poids de 3, et les points sont versés', async () => {
      const afterC = await vote('c', notCame.id, 'CONFIRM');
      expect(afterC.status).toBe('CONFIRMED');
      expect(await score('auteur')).toBe(TRUST_RULES.points.REPORT_CONFIRMED);
      expect(await score('b')).toBe(TRUST_RULES.points.VOTE_CORRECT);
      expect(await score('c')).toBe(TRUST_RULES.points.VOTE_CORRECT);
    });

    it('montre l’historique des points à l’auteur', async () => {
      const response = await http()
        .get('/api/v1/me/trust')
        .set('Authorization', `Bearer ${tokens.auteur}`)
        .expect(200);
      const trust = response.body as TrustSummary;
      expect(trust).toMatchObject({ score: 10, level: 'NEW' });
      expect(trust.events).toEqual([
        expect.objectContaining({ delta: 10, reason: 'REPORT_CONFIRMED' }),
      ]);
    });

    it('refuse un vote sur un signalement clos (409)', async () => {
      await vote('d', notCame.id, 'DENY', 409);
    });

    it('un expert qui contredit fait démentir le signalement : l’auteur perd des points', async () => {
      const delayed = await report('r', {
        type: 'DELAYED',
        lineId: line10.id,
        directionId: line10.outbound,
        stopId: stops.rejiche,
        delayMinutes: 15,
      });
      const afterExpert = await vote('expert', delayed.id, 'DENY');
      expect(afterExpert.status).toBe('REJECTED');
      expect(await score('r')).toBe(TRUST_RULES.points.REPORT_REJECTED);
      expect(await score('expert')).toBe(100 + TRUST_RULES.points.VOTE_CORRECT);
    });
  });

  describe('doublons, visibilité, limites', () => {
    it('un signalement identique devient une confirmation de l’existant', async () => {
      const full = await report('auteur', {
        type: 'FULL',
        lineId: line10.id,
        directionId: line10.outbound,
      });
      const duplicate = await report('d', {
        type: 'FULL',
        lineId: line10.id,
        directionId: line10.outbound,
      });
      expect(duplicate.id).toBe(full.id);
      expect(duplicate).toMatchObject({ confirmations: 1, myVote: 'CONFIRM' });
    });

    it('cache les signalements d’un utilisateur au score très bas', async () => {
      const hidden = await report('faible', {
        type: 'BREAKDOWN',
        lineId: line1.id,
        directionId: line1.direction,
      });
      const publicList = await http().get(`/api/v1/lines/${line1.id}/reports`).expect(200);
      expect((publicList.body as Report[]).map((r) => r.id)).not.toContain(hidden.id);
      const ownList = await http()
        .get(`/api/v1/lines/${line1.id}/reports`)
        .set('Authorization', `Bearer ${tokens.faible}`)
        .expect(200);
      expect(ownList.body).toEqual([expect.objectContaining({ id: hidden.id, mine: true })]);
    });

    it('bloque au-delà de 10 signalements par heure (429)', async () => {
      const h = await userId('h');
      await testApp.prisma.report.createMany({
        data: Array.from({ length: TRUST_RULES.maxReportsPerHour }, () => ({
          userId: h,
          type: 'FULL' as const,
          lineId: line1.id,
          directionId: line1.direction,
          confirmWeight: 1,
          expiresAt: new Date(Date.now() - 1000),
          status: 'EXPIRED' as const,
        })),
      });
      const response = await http()
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${tokens.h}`)
        .send({ type: 'FULL', lineId: line10.id, directionId: line10.outbound })
        .expect(429);
      expect(response.body.message).toContain('heure');
    });

    it('les signalements sans décision expirent', async () => {
      const service = testApp.app.get(ReportsService);
      const expired = await service.expireDue(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
      expect(expired).toBeGreaterThan(0);
      const response = await http().get(`/api/v1/lines/${line10.id}/reports`).expect(200);
      expect((response.body as Report[]).every((r) => r.status !== 'ACTIVE')).toBe(true);
    });
  });

  describe('à l’arrêt et en temps réel', () => {
    it('les prochains passages d’un arrêt incluent ses signalements', async () => {
      const response = await http().get(`/api/v1/stops/${stops.centre}/departures`).expect(200);
      const { reports } = response.body as StopDepartures;
      expect(reports.map((r) => r.id)).toContain(notCame.id);
    });

    it('diffuse un nouveau signalement aux spectateurs de la ligne (Socket.io)', async () => {
      const { port } = testApp.app.getHttpServer().address() as AddressInfo;
      const socket = io(`http://127.0.0.1:${port}/live`, { transports: ['websocket'] });
      // « finally » : un socket resté ouvert empêcherait Jest de s'arrêter.
      try {
        await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
        await socket.emitWithAck(LIVE_EVENTS.watchLine, { lineId: line10.id });

        const received = new Promise<LineReportEvent>((resolve) =>
          socket.on(LIVE_EVENTS.reports, resolve),
        );
        const created = await report('b', {
          type: 'BREAKDOWN',
          lineId: line10.id,
          directionId: line10.outbound,
        });
        const event = await received;

        expect(event.lineId).toBe(line10.id);
        expect(event.report).toMatchObject({ id: created.id, type: 'BREAKDOWN', mine: false });
      } finally {
        socket.close();
      }
    });
  });

  describe('preuves automatiques (bus en direct)', () => {
    it('un bus en direct qui passe l’arrêt dément un « pas venu »', async () => {
      const fake = await report('s', {
        type: 'NOT_CAME',
        lineId: line10.id,
        directionId: line10.outbound,
        stopId: stops.rejiche,
      });

      // Un passager partage la position du bus et dépasse l'arrêt de Rejiche.
      const session = await http()
        .post('/api/v1/live/sessions')
        .set('Authorization', `Bearer ${tokens.passager}`)
        .send({ lineId: line10.id, directionId: line10.outbound })
        .expect(201);
      const sample = (point: GeoPoint, secondsAgo: number) => ({
        ...point,
        accuracy: 10,
        recordedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
      });
      await http()
        .post(`/api/v1/live/sessions/${session.body.id}/positions`)
        .set('Authorization', `Bearer ${tokens.passager}`)
        .send({
          points: [
            sample(along(gare, rejiche, 0.9), 60),
            sample(along(rejiche, station, 0.05), 30),
          ],
        })
        .expect(200);

      // Traitement asynchrone : passage observé, puis preuve appliquée.
      await waitFor(() =>
        testApp.prisma.stopPassageObservation.findFirst({ where: { stopId: stops.rejiche } }),
      );
      const updated = await waitFor(async () => {
        const r = await testApp.prisma.report.findUniqueOrThrow({ where: { id: fake.id } });
        return r.status === 'REJECTED' ? r : null;
      });
      expect(updated.denyWeight).toBe(TRUST_RULES.liveEvidenceWeight);
      expect(await score('s')).toBe(TRUST_RULES.points.REPORT_REJECTED);
    });

    it('un « bus passé » envoyé après le passage observé est confirmé tout de suite', async () => {
      const passed = await report('u', {
        type: 'PASSED',
        lineId: line10.id,
        directionId: line10.outbound,
        stopId: stops.rejiche,
      });
      expect(passed.status).toBe('CONFIRMED');
    });
  });

  describe('statistiques et récompenses', () => {
    it('renvoie les statistiques de la ligne (pas encore assez de données)', async () => {
      const response = await http().get(`/api/v1/lines/${line10.id}/stats`).expect(200);
      expect(LineStatsSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({ periodDays: 30, enoughData: false, onTimeRate: null });
      expect(response.body.notCameConfirmed).toBeGreaterThanOrEqual(1);
    });

    it('répond 404 pour une ligne inconnue', async () => {
      await http().get('/api/v1/lines/7b0f2c4e-8f43-4d8a-9e0b-3c1a2b4d5e6f/stats').expect(404);
    });

    it('récompense au plus 3 partages par jour', async () => {
      const trust = testApp.app.get(TrustService);
      const passager = await userId('passager');
      for (let i = 0; i < 4; i++) await trust.rewardSharing(passager);
      const events = await testApp.prisma.trustEvent.count({
        where: { userId: passager, reason: 'SHARING_COMPLETED' },
      });
      expect(events).toBe(TRUST_RULES.maxRewardedSharingsPerDay);
    });
  });
});
