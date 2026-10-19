import {
  DIRECTIONS,
  LINE_TYPES,
  LiveSessionEndReasonSchema,
  LOCALES,
  MODERATION_ACTION_TYPES,
  NOTIFICATION_TYPES,
  PUSH_PLATFORMS,
  REPORT_STATUSES,
  RIDE_FLAG_REASONS,
  RIDE_OFFER_STATUSES,
  RIDE_REQUEST_STATUSES,
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
  ModerationActionType,
  NotificationType,
  PushPlatform,
  ReportStatus,
  RideFlagReason,
  RideOfferStatus,
  RideRequestStatus,
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
    ['PushPlatform', PushPlatform, PUSH_PLATFORMS],
    ['NotificationType', NotificationType, NOTIFICATION_TYPES],
    ['RideOfferStatus', RideOfferStatus, RIDE_OFFER_STATUSES],
    ['RideRequestStatus', RideRequestStatus, RIDE_REQUEST_STATUSES],
    ['RideFlagReason', RideFlagReason, RIDE_FLAG_REASONS],
    ['ModerationActionType', ModerationActionType, MODERATION_ACTION_TYPES],
  ] as const)('%s', (_name, prismaEnum, sharedValues) => {
    expect(Object.values(prismaEnum)).toEqual([...sharedValues]);
  });
});
