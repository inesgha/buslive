import {
  ModerateReportSchema,
  StopProposalInputSchema,
  UpdateStopSchema,
  UpsertLouageStationSchema,
} from './admin';
import { renderNotification } from './notifications';

const locality = '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d';

describe('StopProposalInputSchema', () => {
  const proposal = { nameFr: 'Hiboun', latitude: 35.5, longitude: 11.05, accuracy: 12 };

  it('accepte une proposition sans nom arabe ni lignes', () => {
    const parsed = StopProposalInputSchema.parse(proposal);
    expect(parsed.lineIds).toEqual([]);
  });

  it('refuse un nom trop court ou une position trop imprécise', () => {
    expect(StopProposalInputSchema.safeParse({ ...proposal, nameFr: ' A ' }).success).toBe(false);
    expect(StopProposalInputSchema.safeParse({ ...proposal, accuracy: 200 }).success).toBe(false);
  });
});

describe('UpdateStopSchema', () => {
  it('exige la latitude ET la longitude', () => {
    expect(UpdateStopSchema.safeParse({ latitude: 35.5 }).success).toBe(false);
    expect(UpdateStopSchema.safeParse({ latitude: 35.5, longitude: 11 }).success).toBe(true);
  });
});

describe('UpsertLouageStationSchema', () => {
  const station = {
    code: 'sousse-louage',
    nameFr: 'Station de Sousse',
    nameAr: 'محطة سوسة',
    latitude: 35.82,
    longitude: 10.63,
    localityId: locality,
    openingMinutes: 300,
    closingMinutes: 1200,
    routes: [{ destinationLocalityId: locality, priceMillimes: 5000, durationMinutes: 60 }],
  };

  it('valide une station', () => {
    expect(UpsertLouageStationSchema.safeParse(station).success).toBe(true);
  });

  it('refuse un code mal formé, des horaires incohérents, une destination en double', () => {
    expect(UpsertLouageStationSchema.safeParse({ ...station, code: 'Sousse Louage' }).success).toBe(
      false,
    );
    expect(UpsertLouageStationSchema.safeParse({ ...station, openingMinutes: 1300 }).success).toBe(
      false,
    );
    expect(UpsertLouageStationSchema.safeParse({ ...station, openingMinutes: null }).success).toBe(
      false,
    );
    expect(
      UpsertLouageStationSchema.safeParse({
        ...station,
        routes: [...station.routes, ...station.routes],
      }).success,
    ).toBe(false);
  });
});

describe('ModerateReportSchema', () => {
  it('ne connaît que trois décisions', () => {
    expect(ModerateReportSchema.safeParse({ decision: 'HIDE' }).success).toBe(true);
    expect(ModerateReportSchema.safeParse({ decision: 'DELETE' }).success).toBe(false);
  });
});

describe('notification « arrêt proposé examiné »', () => {
  const data = {
    stopId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    nameFr: 'Hiboun',
    nameAr: 'هيبون',
    approved: true,
    points: 5,
  };
  it('dans les deux langues', () => {
    expect(renderNotification({ type: 'STOP_PROPOSAL_REVIEWED', data }, 'fr').title).toBe(
      'Arrêt proposé approuvé (+5 points)',
    );
    expect(
      renderNotification(
        { type: 'STOP_PROPOSAL_REVIEWED', data: { ...data, approved: false } },
        'ar',
      ).body,
    ).toContain('هيبون');
  });
});
