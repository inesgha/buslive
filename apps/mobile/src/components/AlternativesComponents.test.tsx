import type { NearbyLouageStation, RideOffer } from '@buslive/shared';
import { render, screen } from '@testing-library/react-native';
import i18n from 'i18next';
import type { ReactElement } from 'react';
import { initReactI18next } from 'react-i18next';

import { resources } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { LouageStationCard } from './LouageStationCard';
import { RideRow } from './RideRow';

const locality = (id: string, code: string, nameFr: string, nameAr: string) => ({
  id,
  code,
  nameFr,
  nameAr,
  governorateCode: 'TN-53',
});
const ksourEssef = locality(
  '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
  'ksour-essef',
  'Ksour Essef',
  'قصور الساف',
);
const sousse = locality('1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', 'sousse', 'Sousse', 'سوسة');
const elJem = locality('2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', 'el-jem', 'El Jem', 'الجم');

const station: NearbyLouageStation = {
  id: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  code: 'ksour-essef-louage',
  nameFr: 'Station de louages de Ksour Essef',
  nameAr: 'محطة اللواج بقصور الساف',
  latitude: 35.4192,
  longitude: 10.9921,
  locality: ksourEssef,
  openingMinutes: 5 * 60 + 30,
  closingMinutes: 19 * 60,
  distanceMeters: 230,
  routes: [
    {
      id: '4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c',
      destination: sousse,
      priceMillimes: 5000,
      durationMinutes: 70,
    },
    {
      id: '5a6b7c8d-9e0f-4a1b-8c3d-4e5f6a7b8c9d',
      destination: elJem,
      priceMillimes: 2400,
      durationMinutes: 35,
    },
  ],
};

const ride: RideOffer = {
  id: '6b7c8d9e-0f1a-4b2c-9d4e-5f6a7b8c9d0e',
  from: ksourEssef,
  to: sousse,
  // 07:30 à Tunis.
  departureAt: '2026-10-19T06:30:00.000Z',
  seats: 3,
  seatsLeft: 2,
  priceMillimes: 4000,
  status: 'ACTIVE',
  driver: { displayName: 'Sami', trustLevel: 'TRUSTED' },
  mine: false,
  myRequest: null,
};
const monday0700 = { isoDate: '2026-10-19', minutes: 7 * 60 };

beforeAll(async () => {
  await i18n
    .use(initReactI18next)
    .init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
});

async function renderThemed(element: ReactElement, locale: 'fr' | 'ar') {
  await i18n.changeLanguage(locale);
  await render(<ThemeProvider>{element}</ThemeProvider>);
}

describe('LouageStationCard', () => {
  it('montre la distance, les horaires, l’ouverture et les prix en dinars', async () => {
    await renderThemed(
      <LouageStationCard station={station} locale="fr" clock={monday0700} />,
      'fr',
    );
    expect(screen.getByText('Ouverte')).toBeTruthy();
    expect(screen.getByText('230 m · de 05:30 à 19:00')).toBeTruthy();
    expect(screen.getByText('5,000 DT · ~70 min')).toBeTruthy();
    expect(screen.getByText('El Jem')).toBeTruthy();
  });

  it('ne garde que la destination choisie', async () => {
    await renderThemed(
      <LouageStationCard
        station={station}
        locale="fr"
        clock={monday0700}
        destinationId={sousse.id}
      />,
      'fr',
    );
    expect(screen.getByText('Sousse')).toBeTruthy();
    expect(screen.queryByText('El Jem')).toBeNull();
  });
});

describe('RideRow', () => {
  it('résume le trajet, le départ, les places et la participation', async () => {
    await renderThemed(
      <RideRow ride={ride} locale="fr" clock={monday0700} onPress={jest.fn()} />,
      'fr',
    );
    expect(screen.getByText('Ksour Essef → Sousse')).toBeTruthy();
    expect(screen.getByText('4,000 DT par place')).toBeTruthy();
    expect(screen.getByText('aujourd’hui à 07:30 · Places libres : 2')).toBeTruthy();
  });

  it('en arabe, sans flèche (elle se lirait à l’envers)', async () => {
    await renderThemed(
      <RideRow ride={ride} locale="ar" clock={monday0700} onPress={jest.fn()} />,
      'ar',
    );
    expect(screen.getByText('قصور الساف – سوسة')).toBeTruthy();
  });
});
