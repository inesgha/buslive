import {
  AlertInputSchema,
  approachingEta,
  incidentConcernsAlert,
  isAlertActive,
  isoWeekday,
} from './alerts';

const ids = {
  lineId: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
  directionId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  stopId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
};
const other = '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b';

describe('isoWeekday', () => {
  it('numérote du lundi (1) au dimanche (7)', () => {
    expect(isoWeekday('2026-10-19')).toBe(1); // lundi
    expect(isoWeekday('2026-10-24')).toBe(6); // samedi
    expect(isoWeekday('2026-10-25')).toBe(7); // dimanche
  });
});

describe('isAlertActive', () => {
  const weekdaysMorning = { days: [1, 2, 3, 4, 5], startMinutes: 7 * 60, endMinutes: 8 * 60 };

  it('vérifie le jour et la plage horaire (bornes comprises)', () => {
    expect(isAlertActive(weekdaysMorning, { isoDate: '2026-10-19', minutes: 7 * 60 })).toBe(true);
    expect(isAlertActive(weekdaysMorning, { isoDate: '2026-10-19', minutes: 8 * 60 })).toBe(true);
    expect(isAlertActive(weekdaysMorning, { isoDate: '2026-10-19', minutes: 8 * 60 + 1 })).toBe(
      false,
    );
    expect(isAlertActive(weekdaysMorning, { isoDate: '2026-10-25', minutes: 7 * 60 + 30 })).toBe(
      false,
    );
  });

  it('avance le début de la plage pour les perturbations', () => {
    const at645 = { isoDate: '2026-10-19', minutes: 6 * 60 + 45 };
    expect(isAlertActive(weekdaysMorning, at645)).toBe(false);
    expect(isAlertActive(weekdaysMorning, at645, 60)).toBe(true);
  });
});

describe('approachingEta', () => {
  const alert = { directionId: ids.directionId, stopMinutesFromStart: 20, leadMinutes: 10 };

  it('prévient quand le bus arrive dans le délai choisi', () => {
    expect(approachingEta({ directionId: ids.directionId, progressMinutes: 12 }, alert)).toBe(8);
  });

  it('ne prévient pas trop tôt, ni après le passage, ni pour l’autre sens', () => {
    expect(approachingEta({ directionId: ids.directionId, progressMinutes: 5 }, alert)).toBeNull();
    expect(approachingEta({ directionId: ids.directionId, progressMinutes: 20 }, alert)).toBeNull();
    expect(approachingEta({ directionId: other, progressMinutes: 12 }, alert)).toBeNull();
  });
});

describe('incidentConcernsAlert', () => {
  const alert = { directionId: ids.directionId, stopId: ids.stopId };

  it('une panne touche tout le sens', () => {
    expect(
      incidentConcernsAlert(
        { type: 'BREAKDOWN', directionId: ids.directionId, stopId: null },
        alert,
      ),
    ).toBe(true);
    expect(
      incidentConcernsAlert({ type: 'BREAKDOWN', directionId: other, stopId: null }, alert),
    ).toBe(false);
  });

  it('« bus passé » ne concerne que son arrêt', () => {
    const passed = { type: 'PASSED' as const, directionId: ids.directionId };
    expect(incidentConcernsAlert({ ...passed, stopId: ids.stopId }, alert)).toBe(true);
    expect(incidentConcernsAlert({ ...passed, stopId: other }, alert)).toBe(false);
  });

  it('« arrêt déplacé » concerne l’arrêt dans les deux sens ; « plein » n’est pas notifié', () => {
    expect(
      incidentConcernsAlert({ type: 'STOP_MOVED', directionId: null, stopId: ids.stopId }, alert),
    ).toBe(true);
    expect(
      incidentConcernsAlert(
        { type: 'FULL', directionId: ids.directionId, stopId: ids.stopId },
        alert,
      ),
    ).toBe(false);
  });
});

describe('AlertInputSchema', () => {
  const valid = {
    ...ids,
    leadMinutes: 10,
    days: [1, 2, 3, 4, 5],
    startMinutes: 6 * 60 + 30,
    endMinutes: 8 * 60,
    notifyApproach: true,
    notifyIncidents: true,
    enabled: true,
  };

  it('accepte une alerte complète', () => {
    expect(AlertInputSchema.safeParse(valid).success).toBe(true);
  });

  it('refuse un délai non proposé, une plage à l’envers, des jours en double', () => {
    expect(AlertInputSchema.safeParse({ ...valid, leadMinutes: 7 }).success).toBe(false);
    expect(AlertInputSchema.safeParse({ ...valid, endMinutes: 6 * 60 }).success).toBe(false);
    expect(AlertInputSchema.safeParse({ ...valid, days: [1, 1] }).success).toBe(false);
    expect(AlertInputSchema.safeParse({ ...valid, days: [] }).success).toBe(false);
  });

  it('exige au moins un type de notification', () => {
    expect(
      AlertInputSchema.safeParse({ ...valid, notifyApproach: false, notifyIncidents: false })
        .success,
    ).toBe(false);
  });
});
