import { LOCALES, ROLES } from '@buslive/shared';

import { Locale, Role } from '../generated/prisma/enums';

/**
 * Les rôles et les langues existent à deux endroits : le schéma Prisma (base de
 * données) et @buslive/shared (validation, apps). Ce test échoue si l'un des
 * deux est modifié sans l'autre.
 */
describe('Synchronisation des enums Prisma ↔ @buslive/shared', () => {
  it('Role', () => {
    expect(Object.values(Role)).toEqual([...ROLES]);
  });

  it('Locale', () => {
    expect(Object.values(Locale)).toEqual([...LOCALES]);
  });
});
