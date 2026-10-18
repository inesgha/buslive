import {
  DIRECTIONS,
  LINE_TYPES,
  LiveSessionEndReasonSchema,
  LOCALES,
  REPORT_STATUSES,
  REPORT_TYPES,
  ROLES,
  TRUST_EVENT_REASONS,
  VOTE_VALUES,
} from '@buslive/shared';

import {
  Direction,
  LineType,
  LiveSessionEndReason,
  Locale,
  ReportStatus,
  ReportType,
  Role,
  TrustEventReason,
  VoteValue,
} from '../generated/prisma/enums';

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
    ['ReportType', ReportType, REPORT_TYPES],
    ['ReportStatus', ReportStatus, REPORT_STATUSES],
    ['VoteValue', VoteValue, VOTE_VALUES],
    ['TrustEventReason', TrustEventReason, TRUST_EVENT_REASONS],
  ] as const)('%s', (_name, prismaEnum, sharedValues) => {
    expect(Object.values(prismaEnum)).toEqual([...sharedValues]);
  });
});
