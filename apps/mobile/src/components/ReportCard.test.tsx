import type { Report } from '@buslive/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { AuthProvider } from '@/auth/AuthProvider';
import { resources } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { ReportCard } from './ReportCard';

const report: Report = {
  id: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  type: 'NOT_CAME',
  status: 'ACTIVE',
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
  stop: {
    id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    nameFr: 'Rejiche – Centre',
    nameAr: 'رجيش – المركز',
  },
  serviceDate: '2026-10-19',
  scheduledMinutes: 7 * 60 + 30,
  delayMinutes: null,
  confirmations: 2,
  denials: 0,
  createdAt: '2026-10-19T06:35:00.000Z',
  expiresAt: '2026-10-19T07:15:00.000Z',
  mine: false,
  myVote: null,
};

beforeAll(async () => {
  await i18n
    .use(initReactI18next)
    .init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
});

async function renderCard(value: Report, locale: 'fr' | 'ar') {
  await i18n.changeLanguage(locale);
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider>
        <AuthProvider>
          <ReportCard report={value} locale={locale} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('ReportCard', () => {
  it('affiche le type, l’arrêt, le bus concerné et les confirmations', async () => {
    await renderCard(report, 'fr');
    expect(screen.getByText('Pas venu')).toBeTruthy();
    expect(screen.getByText('Rejiche – Centre · vers Ksour Essef · Bus de 07:30')).toBeTruthy();
    expect(screen.getByText('Confirmations : 2')).toBeTruthy();
  });

  it('invite à se connecter pour voter quand personne n’est connecté', async () => {
    await renderCard(report, 'fr');
    expect(await screen.findByText('Connecte-toi pour donner ton avis.')).toBeTruthy();
    expect(screen.queryByText('Je confirme')).toBeNull();
  });

  it('indique un signalement confirmé, en arabe', async () => {
    await renderCard({ ...report, status: 'CONFIRMED' }, 'ar');
    expect(screen.getByText('لم تأتِ')).toBeTruthy();
    expect(screen.getByText('مؤكَّد')).toBeTruthy();
  });

  it('reconnaît le signalement de l’utilisateur', async () => {
    await renderCard({ ...report, mine: true }, 'fr');
    expect(screen.getByText('Ton signalement')).toBeTruthy();
  });
});
