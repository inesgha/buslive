import type { Alert, Notification } from '@buslive/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import i18n from 'i18next';
import type { ReactElement } from 'react';
import { initReactI18next } from 'react-i18next';

import { AuthProvider } from '@/auth/AuthProvider';
import { resources } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { AlertRow } from './AlertRow';
import { NotificationRow } from './NotificationRow';

const line = {
  id: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
  code: '10',
  color: '#0E7490',
  nameFr: 'Mahdia – Ksour Essef',
  nameAr: 'المهدية – قصور الساف',
};
const direction = {
  id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  direction: 'OUTBOUND' as const,
  headsignFr: 'vers Ksour Essef',
  headsignAr: 'نحو قصور الساف',
};
const stop = { id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a', nameFr: 'Rejiche', nameAr: 'رجيش' };

const alert: Alert = {
  id: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  line,
  direction,
  stop,
  leadMinutes: 10,
  days: [1, 2, 3, 4, 5],
  startMinutes: 6 * 60 + 30,
  endMinutes: 8 * 60 + 30,
  notifyApproach: true,
  notifyIncidents: true,
  enabled: true,
  createdAt: '2026-10-18T10:00:00.000Z',
};

const approaching: Notification = {
  id: '4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c',
  type: 'BUS_APPROACHING',
  data: {
    lineId: line.id,
    lineCode: '10',
    directionId: direction.id,
    headsignFr: direction.headsignFr,
    headsignAr: direction.headsignAr,
    stopId: stop.id,
    stopNameFr: stop.nameFr,
    stopNameAr: stop.nameAr,
    etaMinutes: 5,
  },
  readAt: null,
  // 06:32 UTC = 07:32 à Tunis.
  createdAt: '2026-10-19T06:32:00.000Z',
};
const monday0750 = { isoDate: '2026-10-19', minutes: 7 * 60 + 50 };

beforeAll(async () => {
  await i18n
    .use(initReactI18next)
    .init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
});

async function renderWithProviders(element: ReactElement, locale: 'fr' | 'ar') {
  await i18n.changeLanguage(locale);
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider>
        <AuthProvider>{element}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('AlertRow', () => {
  it('résume l’arrêt, le sens, les jours, la plage horaire et le délai', async () => {
    await renderWithProviders(
      <AlertRow alert={alert} locale="fr" onPress={jest.fn()} onToggle={jest.fn()} />,
      'fr',
    );
    expect(screen.getByText('Rejiche')).toBeTruthy();
    expect(screen.getByText('vers Ksour Essef')).toBeTruthy();
    expect(screen.getByText('Du lundi au vendredi · de 06:30 à 08:30')).toBeTruthy();
    expect(screen.getByText('Prévenir 10 min avant')).toBeTruthy();
  });

  it('coupe l’alerte avec son interrupteur', async () => {
    const onToggle = jest.fn();
    await renderWithProviders(
      <AlertRow alert={alert} locale="fr" onPress={jest.fn()} onToggle={onToggle} />,
      'fr',
    );
    fireEvent(screen.getByLabelText('Activer l’alerte'), 'valueChange', false);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('NotificationRow', () => {
  it('affiche le même texte que le push, avec l’heure de Tunis', async () => {
    await renderWithProviders(
      <NotificationRow
        notification={approaching}
        locale="fr"
        clock={monday0750}
        onPress={jest.fn()}
      />,
      'fr',
    );
    expect(screen.getByText('Bus 10 vers Ksour Essef')).toBeTruthy();
    expect(screen.getByText('En direct : il arrive à Rejiche dans environ 5 min.')).toBeTruthy();
    expect(screen.getByText('07:32')).toBeTruthy();
  });

  it('s’affiche en arabe', async () => {
    await renderWithProviders(
      <NotificationRow
        notification={approaching}
        locale="ar"
        clock={monday0750}
        onPress={jest.fn()}
      />,
      'ar',
    );
    expect(screen.getByText('الحافلة 10 نحو قصور الساف')).toBeTruthy();
  });
});
