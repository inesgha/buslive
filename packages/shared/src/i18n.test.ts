import { isRtl, LocaleSchema } from './i18n';

describe('i18n', () => {
  it('considère l’arabe comme RTL et le français comme LTR', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('fr')).toBe(false);
  });

  it('refuse une langue non prise en charge', () => {
    expect(LocaleSchema.safeParse('en').success).toBe(false);
  });
});
