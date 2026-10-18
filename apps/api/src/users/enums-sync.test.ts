import {
  DIRECTIONS,
  LINE_TYPES,
  LiveSessionEndReasonSchema,
  LOCALES,
  ROLES,
} from '@buslive/shared';

import { Direction, LineType, LiveSessionEndReason, Locale, Role } from '../generated/prisma/enums';

/**
 * Ces listes existent à deux endroits : le schéma Prisma (base de données) et
 * @buslive/shared (validation, apps). Ce test échoue si l'un des deux est
 * modifié sans l'autre.
 */
describe('Synchronisation des enums Prisma ↔ @buslive/shared', () => {
  it.each([
    ['Role', Role, ROLES],
    ['Locale', Locale, LOCALES],
    ['LineType', LineType, LINE_TYPES],
    ['Direction', Direction, DIRECTIONS],
    ['LiveSessionEndReason', LiveSessionEndReason, LiveSessionEndReasonSchema.options],
  ] as const)('%s', (_name, prismaEnum, sharedValues) => {
    expect(Object.values(prismaEnum)).toEqual([...sharedValues]);
  });
});
