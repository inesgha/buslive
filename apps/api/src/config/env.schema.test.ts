import { productionWarnings, validateEnv } from './env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/buslive?schema=public',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applique les valeurs par défaut', () => {
    const env = validateEnv(validEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it('convertit PORT en nombre et découpe CORS_ORIGINS', () => {
    const env = validateEnv({
      ...validEnv,
      PORT: '4000',
      CORS_ORIGINS: 'http://localhost:5173, http://localhost:8081',
    });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:8081']);
  });

  it('refuse une configuration sans DATABASE_URL', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('refuse une URL qui n’est pas PostgreSQL', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/buslive' })).toThrow(
      /PostgreSQL/,
    );
  });

  it('refuse un port invalide', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('refuse un secret JWT trop court', () => {
    expect(() => validateEnv({ ...validEnv, JWT_ACCESS_SECRET: 'court' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('refuse le secret d’exemple en production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-moi-change-moi-change-moi-change-moi',
      }),
    ).toThrow(/valeur d’exemple/);
  });

  it('envoie les notifications dans la console par défaut (sans Firebase)', () => {
    expect(validateEnv(validEnv).PUSH_PROVIDER).toBe('log');
  });

  it('exige la clé Firebase avec PUSH_PROVIDER=fcm', () => {
    expect(() => validateEnv({ ...validEnv, PUSH_PROVIDER: 'fcm' })).toThrow(
      /GOOGLE_APPLICATION_CREDENTIALS/,
    );
    expect(
      validateEnv({
        ...validEnv,
        PUSH_PROVIDER: 'fcm',
        GOOGLE_APPLICATION_CREDENTIALS: './secrets/firebase-service-account.json',
      }).PUSH_PROVIDER,
    ).toBe('fcm');
  });

  it('refuse le mode « memory » (tests) en production', () => {
    expect(() =>
      validateEnv({ ...validEnv, NODE_ENV: 'production', PUSH_PROVIDER: 'memory' }),
    ).toThrow(/PUSH_PROVIDER/);
  });

  it('refuse des origines non https en production', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'x'.repeat(40),
        CORS_ORIGINS: 'http://admin.buslive.tn',
      }),
    ).toThrow(/https/);
  });

  it('avertit des réglages déconseillés en production', () => {
    const env = validateEnv({
      ...validEnv,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://buslive.tn',
    });
    expect(productionWarnings(env)).toHaveLength(4);
    expect(
      productionWarnings({
        ...env,
        PUSH_PROVIDER: 'fcm',
        TRUST_PROXY: 1,
        LOG_FORMAT: 'json',
        CONTACT_EMAIL: 'contact@buslive.tn',
      }),
    ).toEqual([]);
    expect(productionWarnings(validateEnv(validEnv))).toEqual([]);
  });
});
