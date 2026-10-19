import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import { LiveService } from '../live/live.service';
import { PrismaService } from '../prisma/prisma.service';
import { RidesService } from '../rides/rides.service';

/**
 * Suppression de compte (exigée par Google Play, et droit de la personne).
 *
 * - Supprimé : le compte et tout ce qui lui est propre (sessions, favoris,
 *   alertes, notifications, téléphones, points de confiance, partages, liens
 *   de suivi, demandes de covoiturage) — par les règles ON DELETE CASCADE.
 * - Anonymisé : les signalements et les votes restent, SANS auteur
 *   (ON DELETE SET NULL), pour ne pas fausser l'information des autres
 *   passagers ni les statistiques ; les arrêts proposés gardent leur statut.
 * - Avant la suppression : les trajets de covoiturage à venir sont annulés
 *   (passagers prévenus) et les partages en direct arrêtés.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly live: LiveService,
    private readonly rides: RidesService,
  ) {}

  async delete(userId: string, password: string, now = new Date()): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Compte introuvable.');
    // 403 et non 401 : un 401 ferait croire à l'app que la session a expiré.
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new ForbiddenException('Mot de passe incorrect.');
    }
    // Le journal de modération doit rester complet : un modérateur doit d'abord
    // redevenir simple utilisateur (décision d'un administrateur).
    if (user.role !== 'USER') {
      throw new ConflictException(
        'Un compte de modération ne peut pas être supprimé ici : demande d’abord à un administrateur de retirer ton rôle.',
      );
    }

    const sessions = await this.prisma.liveSession.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true },
    });
    for (const session of sessions) await this.live.end(userId, session.id);

    const offers = await this.prisma.rideOffer.findMany({
      where: { driverId: userId, status: 'ACTIVE', departureAt: { gt: now } },
      select: { id: true },
    });
    for (const offer of offers) await this.rides.forceCancel(offer.id, now);

    await this.prisma.user.delete({ where: { id: userId } });
    // Seul l'identifiant technique est journalisé (jamais l'email).
    this.logger.log(`Compte ${userId} supprimé.`);
  }
}
