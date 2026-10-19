import { tripShareUrl } from './tripShare';

describe('tripShareUrl', () => {
  it('ajoute le chemin du lien à l’adresse du serveur, sans /api/v1', () => {
    expect(tripShareUrl('/t/abc', 'http://192.168.1.10:3000/api/v1')).toBe(
      'http://192.168.1.10:3000/t/abc',
    );
    expect(tripShareUrl('/t/abc', 'https://api.buslive.tn/api/v1/')).toBe(
      'https://api.buslive.tn/t/abc',
    );
  });
});
