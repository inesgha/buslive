import {
  type CalendarRule,
  departuresForDate,
  isCalendarActiveOn,
  minutesToTime,
  passingMinutes,
  timeToMinutes,
  weekdayOf,
} from './schedule';

const noDays = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

const weekdays: CalendarRule = {
  ...noDays,
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  code: 'SEMAINE',
  startDate: null,
  endDate: null,
  priority: 0,
};

const ramadan: CalendarRule = {
  ...noDays,
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: true,
  code: 'RAMADAN',
  startDate: '2027-02-08',
  endDate: '2027-03-09',
  priority: 10,
};

describe('timeToMinutes / minutesToTime', () => {
  it.each([
    ['00:00', 0],
    ['07:30', 450],
    ['23:59', 1439],
    ['24:30', 1470],
  ])('%s ↔ %i minutes', (time, minutes) => {
    expect(timeToMinutes(time)).toBe(minutes);
  });

  it('affiche un départ après minuit sur 24 h', () => {
    expect(minutesToTime(450)).toBe('07:30');
    expect(minutesToTime(1470)).toBe('00:30');
  });

  it.each(['7h30', '25:60', '48:00', ''])('refuse « %s »', (time) => {
    expect(() => timeToMinutes(time)).toThrow();
  });
});

describe('passingMinutes', () => {
  it('ajoute le temps de trajet au départ', () => {
    expect(minutesToTime(passingMinutes(timeToMinutes('07:30'), 25))).toBe('07:55');
  });
});

describe('weekdayOf', () => {
  it('donne le bon jour, quel que soit le fuseau de l’appareil', () => {
    expect(weekdayOf('2026-10-19')).toBe('monday');
    expect(weekdayOf('2026-10-18')).toBe('sunday');
  });
});

describe('isCalendarActiveOn', () => {
  it('respecte les jours de la semaine', () => {
    expect(isCalendarActiveOn(weekdays, '2026-10-19')).toBe(true); // lundi
    expect(isCalendarActiveOn(weekdays, '2026-10-18')).toBe(false); // dimanche
  });

  it('respecte la période de validité (bornes incluses)', () => {
    expect(isCalendarActiveOn(ramadan, '2027-02-07')).toBe(false);
    expect(isCalendarActiveOn(ramadan, '2027-02-08')).toBe(true);
    expect(isCalendarActiveOn(ramadan, '2027-03-09')).toBe(true);
    expect(isCalendarActiveOn(ramadan, '2027-03-10')).toBe(false);
  });
});

describe('departuresForDate', () => {
  const departures = [
    { calendarCode: 'SEMAINE', departureMinutes: 480 },
    { calendarCode: 'SEMAINE', departureMinutes: 420 },
    { calendarCode: 'RAMADAN', departureMinutes: 540 },
  ];
  const calendars = [weekdays, ramadan];

  it('renvoie les départs du calendrier normal, triés', () => {
    expect(departuresForDate(departures, calendars, '2026-10-19')).toEqual([420, 480]);
  });

  it('pendant le Ramadan, les horaires Ramadan remplacent ceux de la semaine', () => {
    expect(departuresForDate(departures, calendars, '2027-02-15')).toEqual([540]);
  });

  it('sans horaires Ramadan pour ce sens, garde les horaires de la semaine', () => {
    const weekdayOnly = departures.filter((d) => d.calendarCode === 'SEMAINE');
    expect(departuresForDate(weekdayOnly, calendars, '2027-02-15')).toEqual([420, 480]);
  });

  it('renvoie une liste vide un jour sans service', () => {
    const weekdayOnly = departures.filter((d) => d.calendarCode === 'SEMAINE');
    expect(departuresForDate(weekdayOnly, calendars, '2026-10-18')).toEqual([]);
  });
});
