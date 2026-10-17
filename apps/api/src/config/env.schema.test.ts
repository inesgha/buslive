import { validateEnv } from './env.schema';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/buslive?schema=public',
};

describe('validateEnv', () => {
  it('applique les valeurs par défaut', () => {
    const env = validateEnv(validEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
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
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('refuse une URL qui n’est pas PostgreSQL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/buslive' })).toThrow(/PostgreSQL/);
  });

  it('refuse un port invalide', () => {
    expect(() => validateEnv({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });
});
