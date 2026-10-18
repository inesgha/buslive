import { contrastRatio } from './contrast';
import { darkColors, lightColors, type ThemeColors } from './tokens';

/** Couleurs utilisées pour du texte, et fonds sur lesquels elles apparaissent. */
const TEXT_COLORS = ['text', 'textMuted', 'live', 'notCame', 'delay'] as const;
const BACKGROUNDS = ['background', 'card'] as const;

describe.each([
  ['clair', lightColors],
  ['sombre', darkColors],
] as [string, ThemeColors][])('thème %s', (_name, colors) => {
  for (const text of TEXT_COLORS) {
    for (const background of BACKGROUNDS) {
      it(`« ${text} » sur « ${background} » respecte le contraste AA (≥ 4,5:1)`, () => {
        expect(contrastRatio(colors[text], colors[background])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('le texte sur le jaune bus est lisible (≥ 4,5:1)', () => {
    expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contrastRatio', () => {
  it('donne 21:1 pour noir sur blanc et 1:1 pour une couleur sur elle-même', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFC52E', '#FFC52E')).toBe(1);
  });
});
