import ar from './locales/ar.json';
import fr from './locales/fr.json';

type Tree = { [key: string]: string | Tree };

/** { a: { b: 'x' } } → { 'a.b': 'x' } */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...flat, [path]: value }
      : { ...flat, ...flatten(value, path) };
  }, {});
}

/** « Au moins {{min}} caractères » → ['min'] */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

const frFlat = flatten(fr);
const arFlat = flatten(ar);

describe('Traductions', () => {
  it('le français et l’arabe ont exactement les mêmes clés', () => {
    expect(Object.keys(arFlat).sort()).toEqual(Object.keys(frFlat).sort());
  });

  it('aucune traduction n’est vide', () => {
    for (const [key, value] of Object.entries({ ...frFlat, ...arFlat })) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  it('les variables {{…}} sont les mêmes dans les deux langues', () => {
    for (const key of Object.keys(frFlat)) {
      expect({ key, vars: placeholders(arFlat[key] ?? '') }).toEqual({
        key,
        vars: placeholders(frFlat[key] ?? ''),
      });
    }
  });

  it('les textes arabes contiennent bien de l’arabe (hors noms de langues)', () => {
    const arabic = /[؀-ۿ]/;
    for (const [key, value] of Object.entries(arFlat)) {
      if (key === 'languages.fr') continue;
      expect({ key, arabic: arabic.test(value) }).toEqual({ key, arabic: true });
    }
  });
});
