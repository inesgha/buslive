import { hasMinRole, TunisianPhoneSchema } from './user';

describe('hasMinRole', () => {
  it('respecte la hiérarchie USER < MODERATOR < ADMIN', () => {
    expect(hasMinRole('ADMIN', 'MODERATOR')).toBe(true);
    expect(hasMinRole('MODERATOR', 'MODERATOR')).toBe(true);
    expect(hasMinRole('USER', 'MODERATOR')).toBe(false);
  });
});

describe('TunisianPhoneSchema', () => {
  it.each([
    ['22 123 456', '+21622123456'],
    ['0021698765432', '+21698765432'],
    ['+216 55-123-456', '+21655123456'],
    ['71.123.456', '+21671123456'],
  ])('normalise « %s » en %s', (input, expected) => {
    expect(TunisianPhoneSchema.parse(input)).toBe(expected);
  });

  it.each(['1234567', '+33612345678', '+21612345678', '221234567'])('refuse « %s »', (input) => {
    expect(TunisianPhoneSchema.safeParse(input).success).toBe(false);
  });
});
