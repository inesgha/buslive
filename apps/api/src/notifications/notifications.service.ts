import { randomUUID } from 'node:crypto';

import {
  channelFor,
  type MarkNotificationsReadInput,
  NOTIFICATION_RULES,
  type Notification as NotificationDto,
  type NotificationContent,
  NotificationContentSchema,
  type NotificationList,
  NotificationSchema,
  notificationUrl,
  type RegisterPushDeviceInput,
  renderNotification,
  type TestNotificationResult,
} from '@buslive/shared';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { type Notification, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_SENDER, type PushSender } from './push/push-sender';

const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Notifications : historique en base, envoi aux téléphones de l'utilisateur,
 * appareils enregistrés, nettoyage périodique.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private purgeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  onModuleInit(): void {
    this.purgeTimer = setInterval(() => {
      void this.purge().catch((error: Error) =>
        this.logger.warn(`Nettoyage des notifications impossible : ${error.message}`),
      );
    }, PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  // --- Envoi ------------------------------------------------------------------------

  /**
   * Enregistre la notification puis l'envoie aux téléphones de l'utilisateur.
   * « dedupeKey » garantit qu'elle n'est créée qu'UNE fois (contrainte unique
   * en base, sûre même si deux déclenchements arrivent en même temps).
   * Renvoie null si elle existait déjà.
   */
  async notify(
    userId: string,
    content: NotificationContent,
    dedupeKey: string,
  ): Promise<NotificationDto | null> {
    const parsed = NotificationContentSchema.parse(content);
    let notification: Notification;
    try {
      notification = await this.prisma.notification.create({
        data: {
          userId,
          type: parsed.type,
          data: parsed.data as Prisma.InputJsonObject,
          dedupeKey,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
    await this.deliver(userId, parsed, notification.id);
    return toDto(notification);
  }

  /** Notification d'essai, demandée depuis le Profil pour vérifier la configuration. */
  async sendTest(userId: string): Promise<TestNotificationResult> {
    // Clé toujours nouvelle : chaque essai part (la limitation des requêtes évite les abus).
    await this.notify(userId, { type: 'TEST', data: {} }, `test:${randomUUID()}`);
    return { devices: await this.prisma.pushDevice.count({ where: { userId } }) };
  }

  /**
   * Envoi push dans la langue du compte. Un échec d'envoi ne fait jamais échouer
   * l'action qui a déclenché la notification : elle reste dans l'historique.
   */
  private async deliver(
    userId: string,
    content: NotificationContent,
    notificationId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, pushDevices: { select: { token: true } } },
    });
    if (!user) return;
    const { title, body } = renderNotification(content, user.locale);
    try {
      const result = await this.push.send(
        user.pushDevices.map((device) => device.token),
        {
          title,
          body,
          channelId: channelFor(content.type),
          // L'app ouvre « url » quand on touche la notification.
          data: { notificationId, type: content.type, url: notificationUrl(content) },
        },
      );
      if (result.invalidTokens.length > 0) {
        await this.prisma.pushDevice.deleteMany({ where: { token: { in: result.invalidTokens } } });
      }
    } catch (error) {
      this.logger.warn(`Envoi push impossible : ${(error as Error).message}`);
    }
  }

  // --- Historique -----------------------------------------------------------------------

  async list(userId: string): Promise<NotificationList> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: NOTIFICATION_RULES.pageSize,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    // Une ancienne notification au format périmé est ignorée plutôt que de tout casser.
    const items = rows.flatMap((row) => {
      const parsed = NotificationSchema.safeParse(serialize(row));
      return parsed.success ? [parsed.data] : [];
    });
    return { items, unread };
  }

  /** Sans « ids » : tout est marqué comme lu. */
  async markRead(userId: string, input: MarkNotificationsReadInput): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(input.ids && { id: { in: input.ids } }) },
      data: { readAt: new Date() },
    });
  }

  // --- Appareils ---------------------------------------------------------------------------

  /**
   * Enregistre le téléphone (appelé à chaque ouverture de l'app). Un jeton
   * désigne un téléphone : s'il était lié à un autre compte (changement de
   * compte sur le même téléphone), il change de propriétaire.
   */
  async registerDevice(userId: string, input: RegisterPushDeviceInput): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform, lastSeenAt: new Date() },
    });
    // Au-delà de la limite, les téléphones les moins récemment vus sont oubliés.
    const extra = await this.prisma.pushDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      skip: NOTIFICATION_RULES.maxDevicesPerUser,
      select: { id: true },
    });
    if (extra.length > 0) {
      await this.prisma.pushDevice.deleteMany({ where: { id: { in: extra.map((d) => d.id) } } });
    }
  }

  /** À la déconnexion : ce téléphone ne reçoit plus les notifications de ce compte. */
  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }

  // --- Nettoyage ------------------------------------------------------------------------------

  async purge(now = new Date()): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - NOTIFICATION_RULES.historyDays * DAY_MS) },
      },
    });
    await this.prisma.pushDevice.deleteMany({
      where: {
        lastSeenAt: {
          lt: new Date(now.getTime() - NOTIFICATION_RULES.deviceInactiveDays * DAY_MS),
        },
      },
    });
  }
}

function serialize(row: Notification) {
  return {
    id: row.id,
    type: row.type,
    data: row.data,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDto(row: Notification): NotificationDto {
  return NotificationSchema.parse(serialize(row));
}
