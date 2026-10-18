import type { LineSummary } from '@buslive/shared';
import { render, screen } from '@testing-library/react-native';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from '@/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';

import { badgeTextColor } from './LineBadge';
import { LineRow } from './LineRow';

const line: LineSummary = {
  id: '0b6a3c1e-5d4f-4a2b-8c9d-1e2f3a4b5c6d',
  code: '10',
  nameFr: 'Mahdia – Ksour Essef',
  nameAr: 'المهدية – قصور الساف',
  type: 'SUBURBAN',
  color: '#0E7490',
  governorateCode: 'TN-53',
  operator: null,
  directions: [
    {
      id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      direction: 'OUTBOUND',
      headsignFr: 'vers Ksour Essef',
      headsignAr: 'نحو قصور الساف',
    },
    {
      id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
      direction: 'INBOUND',
      headsignFr: 'vers Mahdia',
      headsignAr: 'نحو المهدية',
    },
  ],
};

beforeAll(async () => {
  await i18n
    .use(initReactI18next)
    .init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
});

/** Testing Library 14 : render est asynchrone (React 19), il faut l'attendre. */
function renderRow(locale: 'fr' | 'ar') {
  return render(
    <ThemeProvider>
      <LineRow line={line} locale={locale} />
    </ThemeProvider>,
  );
}

describe('LineRow', () => {
  it('affiche le nom, le type et les destinations en français', async () => {
    await i18n.changeLanguage('fr');
    await renderRow('fr');
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('Mahdia – Ksour Essef')).toBeTruthy();
    expect(screen.getByText('Banlieue')).toBeTruthy();
    expect(screen.getByText('vers Ksour Essef · vers Mahdia')).toBeTruthy();
  });

  it('affiche les noms arabes quand l’app est en arabe', async () => {
    await i18n.changeLanguage('ar');
    await renderRow('ar');
    expect(screen.getByText('المهدية – قصور الساف')).toBeTruthy();
    expect(screen.getByText('ضواحي')).toBeTruthy();
    expect(screen.queryByText('Mahdia – Ksour Essef')).toBeNull();
  });
});

describe('badgeTextColor', () => {
  it('choisit le texte le plus lisible sur la couleur de la ligne', () => {
    expect(badgeTextColor('#0E7490')).toBe(palette.white); // bleu foncé → texte blanc
    expect(badgeTextColor('#FFC52E')).toBe(palette.nightBlue); // jaune → texte foncé
  });
});
