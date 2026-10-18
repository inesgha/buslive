import {
  arabicCount,
  channelFor,
  NOTIFICATION_TYPES,
  type NotificationContent,
  NotificationContentSchema,
  notificationUrl,
  renderNotification,
} from './notifications';
import { REPORT_TYPES } from './reports';

const lineId = '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d';
const directionId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const stopId = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const reportId = '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b';

const approaching: NotificationContent = {
  type: 'BUS_APPROACHING',
  data: {
    lineId,
    lineCode: '10',
    directionId,
    headsignFr: 'vers Ksour Essef',
    headsignAr: 'نحو قصور الساف',
    stopId,
    stopNameFr: 'Rejiche',
    stopNameAr: 'رجيش',
    etaMinutes: 5,
  },
};

const incident = (reportType: (typeof REPORT_TYPES)[number]): NotificationContent => ({
  type: 'LINE_INCIDENT',
  data: {
    reportId,
    reportType,
    lineId,
    lineCode: '10',
    headsignFr: 'vers Ksour Essef',
    headsignAr: 'نحو قصور الساف',
    stopNameFr: 'Rejiche',
    stopNameAr: 'رجيش',
    delayMinutes: reportType === 'DELAYED' ? 15 : null,
  },
});

describe('renderNotification', () => {
  it('« bus qui approche » en français et en arabe', () => {
    expect(renderNotification(approaching, 'fr')).toEqual({
      title: 'Bus 10 vers Ksour Essef',
      body: 'En direct : il arrive à Rejiche dans environ 5 min.',
    });
    const ar = renderNotification(approaching, 'ar');
    expect(ar.title).toContain('قصور الساف');
    expect(ar.body).toContain('5 دقائق');
  });

  it('a un texte pour chaque type de signalement, dans les deux langues', () => {
    for (const type of REPORT_TYPES) {
      for (const locale of ['fr', 'ar'] as const) {
        const { title, body } = renderNotification(incident(type), locale);
        expect(title).toContain('10');
        expect(body.length).toBeGreaterThan(10);
        expect(`${title} ${body}`).not.toContain('undefined');
      }
    }
    expect(renderNotification(incident('DELAYED'), 'fr').body).toBe(
      'Retard d’environ 15 min à Rejiche (vers Ksour Essef). Confirmé par des passagers.',
    );
  });

  it('se passe de l’arrêt et du sens quand ils sont inconnus', () => {
    const content: NotificationContent = {
      type: 'LINE_INCIDENT',
      data: {
        ...(incident('BREAKDOWN').data as Extract<
          NotificationContent,
          { type: 'LINE_INCIDENT' }
        >['data']),
        headsignFr: null,
        headsignAr: null,
        stopNameFr: null,
        stopNameAr: null,
      },
    };
    expect(renderNotification(content, 'fr').body).toBe(
      'Un bus est en panne. Confirmé par des passagers.',
    );
  });

  it('résultat d’un signalement, avec les points signés', () => {
    const resolved = (status: 'CONFIRMED' | 'REJECTED', points: number): NotificationContent => ({
      type: 'REPORT_RESOLVED',
      data: { reportId, lineId, lineCode: '10', status, points },
    });
    expect(renderNotification(resolved('CONFIRMED', 10), 'fr').title).toBe(
      'Signalement confirmé (+10 points)',
    );
    expect(renderNotification(resolved('REJECTED', -15), 'fr').title).toBe(
      'Signalement démenti (−15 points)',
    );
    expect(renderNotification(resolved('CONFIRMED', 10), 'ar').title).toContain('+10 نقاط');
    expect(renderNotification(resolved('REJECTED', -15), 'ar').title).toContain('−15 نقطة');
  });
});

describe('arabicCount', () => {
  const forms = { one: 'دقيقة واحدة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' };
  it('accorde le nom avec le nombre', () => {
    expect(arabicCount(1, forms)).toBe('دقيقة واحدة');
    expect(arabicCount(2, forms)).toBe('دقيقتين');
    expect(arabicCount(7, forms)).toBe('7 دقائق');
    expect(arabicCount(15, forms)).toBe('15 دقيقة');
  });
});

describe('channelFor / notificationUrl', () => {
  it('range chaque type dans un canal Android', () => {
    expect(channelFor('BUS_APPROACHING')).toBe('approaching');
    expect(channelFor('LINE_INCIDENT')).toBe('incidents');
    expect(channelFor('REPORT_RESOLVED')).toBe('account');
    expect(NOTIFICATION_TYPES.map(channelFor)).toHaveLength(NOTIFICATION_TYPES.length);
  });

  it('ouvre la ligne concernée', () => {
    expect(notificationUrl(approaching)).toBe(`/lines/${lineId}`);
    expect(notificationUrl({ type: 'TEST', data: {} })).toBe('/alerts');
  });
});

describe('NotificationContentSchema', () => {
  it('valide le contenu selon le type', () => {
    expect(NotificationContentSchema.safeParse(approaching).success).toBe(true);
    expect(
      NotificationContentSchema.safeParse({ type: 'BUS_APPROACHING', data: { lineId } }).success,
    ).toBe(false);
  });
});
