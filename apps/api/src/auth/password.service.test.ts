import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produit une empreinte argon2id avec les paramètres OWASP', async () => {
    const passwordHash = await service.hash('motdepasse');
    expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(passwordHash).not.toContain('motdepasse');
  });

  it('vérifie le bon mot de passe et refuse un mauvais', async () => {
    const passwordHash = await service.hash('motdepasse');
    await expect(service.verify(passwordHash, 'motdepasse')).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'MotDePasse')).resolves.toBe(false);
  });

  it('refuse une empreinte corrompue sans lever d’erreur', async () => {
    await expect(service.verify('pas-une-empreinte', 'motdepasse')).resolves.toBe(false);
  });

  it('verifyDummy renvoie toujours false', async () => {
    await expect(service.verifyDummy('motdepasse')).resolves.toBe(false);
  });
});
