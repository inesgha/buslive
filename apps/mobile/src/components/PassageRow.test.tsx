import type { StopPassage } from '@buslive/shared';
import { render, screen } from '@testing-library/react-native';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { PassageRow } from './PassageRow';

const passage: StopPassage = {
  line: {
    id: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
    code: '10',
    color: '#0E7490',
    nameFr: 'Mahdia – Ksour Essef',
    nameAr: 'المهدية – قصور الساف',
  },
  direction: {
    id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    direction: 'OUTBOUND',
    headsignFr: 'vers Ksour Essef',
    headsignAr: 'نحو قصور الساف',
  },
  serviceDate: '2026-10-19',
  passingMinutes: 9 * 60,
  live: null,
};

beforeAll(async () => {
  await i18n
    .use(initReactI18next)
    .init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
});

async function renderAt(minutes: number, locale: 'fr' | 'ar') {
  await i18n.changeLanguage(locale);
  await render(
    <ThemeProvider>
      <PassageRow passage={passage} clock={{ isoDate: '2026-10-19', minutes }} locale={locale} />
    </ThemeProvider>,
  );
}

describe('PassageRow', () => {
  it('affiche la ligne, la destination et le compte à rebours', async () => {
    await renderAt(8 * 60 + 52, 'fr');
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('vers Ksour Essef')).toBeTruthy();
    expect(screen.getByText('dans 8 min')).toBeTruthy();
  });

  it('affiche l’heure quand le passage est dans plus d’une heure, en arabe', async () => {
    await renderAt(7 * 60, 'ar');
    expect(screen.getByText('نحو قصور الساف')).toBeTruthy();
    expect(screen.getByText('على الساعة 09:00')).toBeTruthy();
  });
});
