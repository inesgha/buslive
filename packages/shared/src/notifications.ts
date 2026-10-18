import { z } from 'zod';

import type { Locale } from './i18n';
import { type ReportType, ReportTypeSchema } from './reports';

/**
 * Notifications : types, contenu, et textes en français et en arabe.
 * Les textes sont écrits UNE seule fois, ici : l'API s'en sert pour les push
 * (dans la langue du compte), l'app pour l'historique (dans la langue affichée).
 */

export const NOTIFICATION_TYPES = [
  'BUS_APPROACHING', // un bus en direct arrive à l'arrêt d'une alerte
  'LINE_INCIDENT', // un signalement confirmé touche le trajet d'une alerte
  'REPORT_RESOLVED', // mon signalement a été confirmé ou démenti
  'TEST', // notification d'essai demandée depuis le Profil
] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const PUSH_PLATFORMS = ['ANDROID', 'IOS'] as const;
export const PushPlatformSchema = z.enum(PUSH_PLATFORMS);
export type PushPlatform = z.infer<typeof PushPlatformSchema>;

/**
 * Canaux Android : chacun peut être coupé séparément dans les réglages du
 * téléphone. L'app les crée avec les mêmes identifiants.
 */
export const NOTIFICATION_CHANNELS = ['approaching', 'incidents', 'account'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function channelFor(type: NotificationType): NotificationChannel {
  switch (type) {
    case 'BUS_APPROACHING':
      return 'approaching';
    case 'LINE_INCIDENT':
      return 'incidents';
    default:
      return 'account';
  }
}

export const NOTIFICATION_RULES = {
  /** Durée de conservation de l'historique (jours). */
  historyDays: 30,
  /** Un appareil qui ne s'est pas manifesté depuis ce délai est oublié (jours). */
  deviceInactiveDays: 60,
  /** Nombre de notifications renvoyées par GET /me/notifications. */
  pageSize: 50,
  /** Téléphones par compte : au-delà, les moins récemment vus sont oubliés. */
  maxDevicesPerUser: 5,
} as const;

// --- Contenu ----------------------------------------------------------------------
// Les noms sont recopiés dans la notification (instantané) : l'historique reste
// lisible même si la ligne change de nom ou disparaît. Les destinations (headsign)
// contiennent déjà « vers … » / « نحو … » : elles sont affichées telles quelles.

const BusApproachingDataSchema = z.object({
  lineId: z.uuid(),
  lineCode: z.string(),
  directionId: z.uuid(),
  headsignFr: z.string(),
  headsignAr: z.string(),
  stopId: z.uuid(),
  stopNameFr: z.string(),
  stopNameAr: z.string(),
  etaMinutes: z.number().int().positive(),
});

const LineIncidentDataSchema = z.object({
  reportId: z.uuid(),
  reportType: ReportTypeSchema,
  lineId: z.uuid(),
  lineCode: z.string(),
  headsignFr: z.string().nullable(),
  headsignAr: z.string().nullable(),
  stopNameFr: z.string().nullable(),
  stopNameAr: z.string().nullable(),
  delayMinutes: z.number().int().nullable(),
});

const ReportResolvedDataSchema = z.object({
  reportId: z.uuid(),
  lineId: z.uuid(),
  lineCode: z.string(),
  status: z.enum(['CONFIRMED', 'REJECTED']),
  /** Points gagnés (positif) ou perdus (négatif). */
  points: z.number().int(),
});

const BusApproaching = z.object({
  type: z.literal('BUS_APPROACHING'),
  data: BusApproachingDataSchema,
});
const LineIncident = z.object({ type: z.literal('LINE_INCIDENT'), data: LineIncidentDataSchema });
const ReportResolved = z.object({
  type: z.literal('REPORT_RESOLVED'),
  data: ReportResolvedDataSchema,
});
const Test = z.object({ type: z.literal('TEST'), data: z.object({}) });

/** Contenu d'une notification : son type et les données qui vont avec. */
export const NotificationContentSchema = z.discriminatedUnion('type', [
  BusApproaching,
  LineIncident,
  ReportResolved,
  Test,
]);
export type NotificationContent = z.infer<typeof NotificationContentSchema>;

const meta = {
  id: z.uuid(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
};

/** Une notification de l'historique. */
export const NotificationSchema = z.discriminatedUnion('type', [
  BusApproaching.extend(meta),
  LineIncident.extend(meta),
  ReportResolved.extend(meta),
  Test.extend(meta),
]);
export type Notification = z.infer<typeof NotificationSchema>;

/** Réponse de GET /me/notifications. */
export const NotificationListSchema = z.object({
  items: z.array(NotificationSchema),
  unread: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof NotificationListSchema>;

/** Corps de POST /me/notifications/read : sans « ids », tout est marqué comme lu. */
export const MarkNotificationsReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100).optional(),
});
export type MarkNotificationsReadInput = z.infer<typeof MarkNotificationsReadSchema>;

// --- Appareils -----------------------------------------------------------------------

/** Jeton FCM d'un téléphone (POST /me/push-devices). */
export const RegisterPushDeviceSchema = z.object({
  token: z.string().min(1).max(4096),
  platform: PushPlatformSchema,
});
export type RegisterPushDeviceInput = z.infer<typeof RegisterPushDeviceSchema>;

/** POST /me/push-devices/unregister (à la déconnexion). */
export const UnregisterPushDeviceSchema = z.object({ token: z.string().min(1).max(4096) });
export type UnregisterPushDeviceInput = z.infer<typeof UnregisterPushDeviceSchema>;

/** Réponse de POST /me/notifications/test. */
export const TestNotificationResultSchema = z.object({
  /** Appareils auxquels l'essai a été envoyé. */
  devices: z.number().int().nonnegative(),
});
export type TestNotificationResult = z.infer<typeof TestNotificationResultSchema>;

// --- Textes ----------------------------------------------------------------------------

export interface RenderedNotification {
  title: string;
  body: string;
}

/**
 * Nombre suivi de son nom en arabe, avec l'accord du nom :
 * 1 → singulier sans chiffre, 2 → duel, 3 à 10 → pluriel, au-delà → singulier.
 */
export function arabicCount(
  count: number,
  forms: { one: string; two: string; few: string; many: string },
): string {
  const n = Math.abs(count);
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

const arabicMinutes = (n: number) =>
  arabicCount(n, { one: 'دقيقة واحدة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' });
const arabicPoints = (n: number) =>
  arabicCount(n, { one: 'نقطة واحدة', two: 'نقطتين', few: 'نقاط', many: 'نقطة' });

/** +10 / −15 (vrai signe moins, plus lisible). */
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

const INCIDENT_LABELS: Record<ReportType, Record<Locale, string>> = {
  NOT_CAME: { fr: 'bus pas venu', ar: 'الحافلة لم تأتِ' },
  PASSED: { fr: 'bus déjà passé', ar: 'الحافلة مرّت' },
  FULL: { fr: 'bus plein', ar: 'الحافلة ممتلئة' },
  DELAYED: { fr: 'retard', ar: 'تأخير' },
  BREAKDOWN: { fr: 'bus en panne', ar: 'حافلة معطّلة' },
  STOP_MOVED: { fr: 'arrêt déplacé', ar: 'تغيير مكان المحطة' },
};

/** Titre et texte d'une notification dans la langue demandée. */
export function renderNotification(
  content: NotificationContent,
  locale: Locale,
): RenderedNotification {
  const ar = locale === 'ar';
  switch (content.type) {
    case 'BUS_APPROACHING': {
      const d = content.data;
      return ar
        ? {
            title: `الحافلة ${d.lineCode} ${d.headsignAr}`,
            body: `مباشر: تصل إلى ${d.stopNameAr} بعد حوالي ${arabicMinutes(d.etaMinutes)}.`,
          }
        : {
            title: `Bus ${d.lineCode} ${d.headsignFr}`,
            body: `En direct : il arrive à ${d.stopNameFr} dans environ ${d.etaMinutes} min.`,
          };
    }
    case 'LINE_INCIDENT':
      return renderIncident(content.data, locale);
    case 'REPORT_RESOLVED': {
      const d = content.data;
      const confirmed = d.status === 'CONFIRMED';
      if (ar) {
        const points = `${d.points >= 0 ? '+' : '−'}${arabicPoints(d.points)}`;
        return confirmed
          ? {
              title: `تمّ تأكيد بلاغك (${points})`,
              body: `أكّد ركّاب آخرون بلاغك على الخط ${d.lineCode}. شكرًا!`,
            }
          : {
              title: `تمّ نفي بلاغك (${points})`,
              body: `نفى ركّاب آخرون أو حافلة مباشرة بلاغك على الخط ${d.lineCode}.`,
            };
      }
      return confirmed
        ? {
            title: `Signalement confirmé (${signed(d.points)} points)`,
            body: `D’autres passagers ont confirmé ton signalement sur la ligne ${d.lineCode}. Merci !`,
          }
        : {
            title: `Signalement démenti (${signed(d.points)} points)`,
            body: `Ton signalement sur la ligne ${d.lineCode} a été démenti par d’autres passagers ou par un bus en direct.`,
          };
    }
    case 'TEST':
      return ar
        ? { title: 'BusLive', body: 'الإشعارات تعمل على هذا الهاتف.' }
        : { title: 'BusLive', body: 'Les notifications fonctionnent sur ce téléphone.' };
  }
}

function renderIncident(
  d: z.infer<typeof LineIncidentDataSchema>,
  locale: Locale,
): RenderedNotification {
  const label = INCIDENT_LABELS[d.reportType][locale];
  if (locale === 'ar') {
    const atStop = d.stopNameAr ? ` بمحطة ${d.stopNameAr}` : '';
    const towards = d.headsignAr ? ` (${d.headsignAr})` : '';
    const confirmed = ' أكّد ذلك عدد من الركّاب.';
    const bodies: Record<ReportType, string> = {
      NOT_CAME: `لم تمرّ الحافلة${atStop}${towards}.`,
      PASSED: `مرّت الحافلة${atStop}${towards}.`,
      FULL: `الحافلة${towards} ممتلئة.`,
      DELAYED: `تأخير${d.delayMinutes ? ` بحوالي ${arabicMinutes(d.delayMinutes)}` : ''}${atStop}${towards}.`,
      BREAKDOWN: `حافلة معطّلة${towards}.`,
      STOP_MOVED: `تمّ تغيير مكان المحطة${d.stopNameAr ? ` ${d.stopNameAr}` : ''}.`,
    };
    return { title: `الخط ${d.lineCode}: ${label}`, body: `${bodies[d.reportType]}${confirmed}` };
  }
  const atStop = d.stopNameFr ? ` à ${d.stopNameFr}` : '';
  const towards = d.headsignFr ? ` (${d.headsignFr})` : '';
  const confirmed = ' Confirmé par des passagers.';
  const bodies: Record<ReportType, string> = {
    NOT_CAME: `Le bus n’est pas passé${atStop}${towards}.`,
    PASSED: `Le bus est déjà passé${atStop}${towards}.`,
    FULL: `Le bus${towards} est plein.`,
    DELAYED: `Retard${d.delayMinutes ? ` d’environ ${d.delayMinutes} min` : ''}${atStop}${towards}.`,
    BREAKDOWN: `Un bus est en panne${towards}.`,
    STOP_MOVED: `L’arrêt${d.stopNameFr ? ` ${d.stopNameFr}` : ''} a été déplacé.`,
  };
  return { title: `Ligne ${d.lineCode} : ${label}`, body: `${bodies[d.reportType]}${confirmed}` };
}

/** Écran à ouvrir quand on touche la notification (chemin expo-router). */
export function notificationUrl(content: NotificationContent): string {
  switch (content.type) {
    case 'BUS_APPROACHING':
    case 'LINE_INCIDENT':
      return `/lines/${content.data.lineId}`;
    case 'REPORT_RESOLVED':
      return '/profile';
    default:
      return '/alerts';
  }
}
