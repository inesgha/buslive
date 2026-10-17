import { EmailSchema, LoginSchema, RegisterSchema } from './auth';

describe('EmailSchema', () => {
  it('nettoie les espaces et met en minuscules avant de valider', () => {
    expect(EmailSchema.parse('  Ines@Example.TN ')).toBe('ines@example.tn');
  });

  it('refuse un email invalide', () => {
    expect(EmailSchema.safeParse('ines@').success).toBe(false);
  });
});

describe('RegisterSchema', () => {
  const valid = { email: 'ines@example.tn', password: 'motdepasse', displayName: 'Inès' };

  it('accepte une inscription valide et choisit le français par défaut', () => {
    expect(RegisterSchema.parse(valid).locale).toBe('fr');
  });

  it('refuse un mot de passe trop court', () => {
    expect(RegisterSchema.safeParse({ ...valid, password: 'court' }).success).toBe(false);
  });

  it('refuse un mot de passe de plus de 128 caractères', () => {
    expect(RegisterSchema.safeParse({ ...valid, password: 'a'.repeat(129) }).success).toBe(false);
  });

  it('accepte un nom en arabe', () => {
    expect(RegisterSchema.safeParse({ ...valid, displayName: 'أميرة' }).success).toBe(true);
  });

  it('refuse un nom contenant un caractère mal encodé (U+FFFD)', () => {
    expect(RegisterSchema.safeParse({ ...valid, displayName: 'D�mo' }).success).toBe(false);
  });

  it('ignore un champ « role » envoyé par le client', () => {
    const parsed = RegisterSchema.parse({ ...valid, role: 'ADMIN' });
    expect(parsed).not.toHaveProperty('role');
  });
});

describe('LoginSchema', () => {
  it('n’impose pas la longueur minimale (anciens mots de passe)', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.tn', password: 'x' }).success).toBe(true);
  });
});
