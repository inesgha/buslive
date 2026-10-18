import { CreateReportSchema } from './reports';
import { computeLineStats } from './stats';
import {
  clampScore,
  reportLifetimeMinutes,
  resolveReport,
  TRUST_RULES,
  trustLevel,
  voteWeight,
} from './trust';

describe('voteWeight', () => {
  it.each([
    [0, 1],
    [50, 2],
    [100, 3],
    [500, 3], // plafonné
    [-30, 0.4],
    [-100, 0.25], // plancher
  ])('score %i → poids %d', (score, weight) => {
    expect(voteWeight(score)).toBeCloseTo(weight);
  });
});

describe('trustLevel / clampScore', () => {
  it('donne le bon niveau', () => {
    expect(trustLevel(0)).toBe('NEW');
    expect(trustLevel(20)).toBe('TRUSTED');
    expect(trustLevel(100)).toBe('EXPERT');
  });

  it('borne le score', () => {
    expect(clampScore(-500)).toBe(TRUST_RULES.minScore);
    expect(clampScore(5000)).toBe(TRUST_RULES.maxScore);
  });
});

describe('resolveReport', () => {
  it('attend tant que les avis sont insuffisants', () => {
    expect(resolveReport({ confirmWeight: 1, denyWeight: 0 })).toBeNull();
    expect(resolveReport({ confirmWeight: 2, denyWeight: 3 })).toBeNull();
  });

  it('confirme à partir d’un poids « pour » de 3', () => {
    expect(resolveReport({ confirmWeight: 3, denyWeight: 0 })).toBe('CONFIRMED');
  });

  it('dément quand les « contre » dépassent les « pour » de 2', () => {
    expect(resolveReport({ confirmWeight: 1, denyWeight: 3 })).toBe('REJECTED');
  });

  it('un nouvel utilisateur ne peut pas confirmer seul ; un expert le peut', () => {
    expect(resolveReport({ confirmWeight: voteWeight(0), denyWeight: 0 })).toBeNull();
    expect(resolveReport({ confirmWeight: voteWeight(100), denyWeight: 0 })).toBe('CONFIRMED');
  });
});

describe('reportLifetimeMinutes', () => {
  it('compte à partir de l’horaire concerné pour « pas venu »', () => {
    expect(reportLifetimeMinutes('NOT_CAME', 10)).toBe(55); // horaire dans 10 min + 45
    expect(reportLifetimeMinutes('NOT_CAME', -20)).toBe(25); // horaire passé de 20 min
  });

  it('garde une durée minimale de 10 min', () => {
    expect(reportLifetimeMinutes('NOT_CAME', -120)).toBe(10);
  });

  it('ignore l’horaire pour les autres types', () => {
    expect(reportLifetimeMinutes('FULL', 50)).toBe(30);
    expect(reportLifetimeMinutes('STOP_MOVED')).toBe(7 * 24 * 60);
  });
});

describe('CreateReportSchema', () => {
  const ids = {
    lineId: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
    directionId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    stopId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  };

  it('accepte un « pas venu » complet', () => {
    const result = CreateReportSchema.safeParse({
      type: 'NOT_CAME',
      ...ids,
      serviceDate: '2026-10-19',
      scheduledMinutes: 450,
    });
    expect(result.success).toBe(true);
  });

  it('exige l’arrêt pour un « pas venu »', () => {
    const result = CreateReportSchema.safeParse({
      type: 'NOT_CAME',
      lineId: ids.lineId,
      directionId: ids.directionId,
    });
    expect(result.success).toBe(false);
  });

  it('exige la position pour un « arrêt déplacé »', () => {
    expect(
      CreateReportSchema.safeParse({ type: 'STOP_MOVED', lineId: ids.lineId, stopId: ids.stopId })
        .success,
    ).toBe(false);
  });

  it('refuse un retard sur un autre type que « retard »', () => {
    expect(CreateReportSchema.safeParse({ type: 'FULL', ...ids, delayMinutes: 10 }).success).toBe(
      false,
    );
  });

  it('refuse un horaire incomplet', () => {
    expect(
      CreateReportSchema.safeParse({ type: 'NOT_CAME', ...ids, serviceDate: '2026-10-19' }).success,
    ).toBe(false);
  });
});

describe('computeLineStats', () => {
  it('ne donne pas de pourcentage avec trop peu de passages', () => {
    expect(computeLineStats([1, 2, 3])).toEqual({
      observedPassages: 3,
      onTimeRate: null,
      averageDelayMinutes: null,
      enoughData: false,
    });
  });

  it('calcule la ponctualité (± 3 min) et le retard moyen', () => {
    const delays = [0, 1, -2, 3, 5, 10, 0, 2, -1, 12];
    expect(computeLineStats(delays)).toEqual({
      observedPassages: 10,
      onTimeRate: 0.7,
      averageDelayMinutes: 3,
      enoughData: true,
    });
  });
});
