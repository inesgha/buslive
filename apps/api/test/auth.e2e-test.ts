// Parcours complet d'authentification sur la vraie base (base « _test »).
import { AuthResponseSchema, type AuthResponse, UserProfileSchema } from '@buslive/shared';
import request from 'supertest';

import { hashToken } from '../src/auth/refresh-token.service';
import { RATE_LIMIT_OPTIONS } from '../src/common/rate-limit/rate-limit.guard';
import { createTestApp, resetDatabase, type TestApp } from './utils';

const PASSWORD = 'un-mot-de-passe-solide';
const newUser = { email: 'ines@example.tn', password: PASSWORD, displayName: 'Inès' };

describe('Authentification (e2e)', () => {
  let testApp: TestApp;
  const http = () => request(testApp.app.getHttpServer());

  /** Inscrit puis renvoie la réponse (jetons + profil). */
  async function register(body: object = newUser): Promise<AuthResponse> {
    const response = await http().post('/api/v1/auth/register').send(body).expect(201);
    return response.body as AuthResponse;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe('POST /auth/register', () => {
    it('crée le compte et renvoie profil + jetons conformes au schéma partagé', async () => {
      const body = await register({ ...newUser, email: '  Ines@Example.TN ' });
      expect(AuthResponseSchema.safeParse(body).success).toBe(true);
      expect(body.user).toMatchObject({ email: 'ines@example.tn', role: 'USER', locale: 'fr' });
      expect(body.user).not.toHaveProperty('passwordHash');
    });

    it('stocke une empreinte argon2id, jamais le mot de passe', async () => {
      await register();
      const user = await testApp.prisma.user.findUniqueOrThrow({
        where: { email: newUser.email },
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(PASSWORD);
    });

    it('ignore un rôle envoyé par le client', async () => {
      const body = await register({ ...newUser, role: 'ADMIN' });
      expect(body.user.role).toBe('USER');
    });

    it('refuse un email déjà utilisé, même avec une autre casse (409)', async () => {
      await register();
      await http()
        .post('/api/v1/auth/register')
        .send({ ...newUser, email: 'INES@example.tn' })
        .expect(409);
    });

    it('refuse des données invalides avec le détail des champs (400)', async () => {
      const response = await http()
        .post('/api/v1/auth/register')
        .send({ email: 'pas-un-email', password: 'court', displayName: 'I' })
        .expect(400);
      const paths = (response.body.errors as { path: string }[]).map((error) => error.path);
      expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'displayName']));
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register();
    });

    it('connecte avec les bons identifiants', async () => {
      const response = await http()
        .post('/api/v1/auth/login')
        .send({ email: newUser.email, password: PASSWORD })
        .expect(200);
      expect(AuthResponseSchema.safeParse(response.body).success).toBe(true);
    });

    it('renvoie le même message pour un mauvais mot de passe et un email inconnu (401)', async () => {
      const wrongPassword = await http()
        .post('/api/v1/auth/login')
        .send({ email: newUser.email, password: 'mauvais' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'inconnu@example.tn', password: PASSWORD })
        .expect(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('GET /auth/me et protection des routes', () => {
    it('refuse sans jeton (401)', async () => {
      await http().get('/api/v1/auth/me').expect(401);
    });

    it('refuse un jeton invalide (401)', async () => {
      await http().get('/api/v1/auth/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    });

    it('renvoie le profil avec un access token valide', async () => {
      const { tokens } = await register();
      const response = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
      expect(UserProfileSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.email).toBe(newUser.email);
    });
  });

  describe('POST /auth/refresh (rotation)', () => {
    it('ne stocke que l’empreinte SHA-256 du refresh token', async () => {
      const { tokens } = await register();
      const stored = await testApp.prisma.refreshToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(hashToken(tokens.refreshToken));
      expect(stored[0]?.tokenHash).not.toBe(tokens.refreshToken);
    });

    it('échange un refresh token contre de nouveaux jetons', async () => {
      const { tokens } = await register();
      const response = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(200);
      const next = response.body as AuthResponse;
      expect(next.tokens.refreshToken).not.toBe(tokens.refreshToken);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${next.tokens.accessToken}`)
        .expect(200);
    });

    it('détecte la réutilisation d’un ancien jeton et révoque toute la session', async () => {
      const { tokens: first } = await register();
      const second = (
        await http().post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken })
      ).body as AuthResponse;

      // Un attaquant rejoue l'ancien jeton : refusé…
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      // …et le jeton légitime le plus récent est révoqué lui aussi.
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second.tokens.refreshToken })
        .expect(401);
    });

    it('refuse un refresh token expiré (401)', async () => {
      const { tokens } = await register();
      await testApp.prisma.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('refuse un refresh token inconnu (401)', async () => {
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('révoque la session : le refresh token ne fonctionne plus', async () => {
      const { tokens } = await register();
      await http()
        .post('/api/v1/auth/logout')
        .send({ refreshToken: tokens.refreshToken })
        .expect(204);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokens.refreshToken })
        .expect(401);
    });

    it('répond 204 même pour un jeton inconnu', async () => {
      await http()
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(204);
    });
  });
});

describe('Limitation des tentatives (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // Application dédiée (compteurs neufs) avec une limite basse : 3 tentatives par minute.
    testApp = await createTestApp((builder) =>
      builder.overrideProvider(RATE_LIMIT_OPTIONS).useValue({ max: 3, windowSeconds: 60 }),
    );
    await resetDatabase(testApp.prisma);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('bloque /auth/login après trop de tentatives (429)', async () => {
    const attempt = () =>
      request(testApp.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'inconnu@example.tn', password: 'mauvais' });

    for (let i = 0; i < 3; i++) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});
