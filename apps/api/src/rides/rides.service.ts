import {
  type CreateRideOfferInput,
  isRideOpen,
  type MyRides,
  type RideFlagReason,
  type RideNotificationType,
  type RideOffer,
  type RideOfferDetail,
  RIDE_RULES,
  type RideSearchQuery,
  seatsLeft,
} from '@buslive/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { rideInclude, type RideWithRelations, toRideDetail, toRideOffer } from './rides.mapper';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Covoiturage : annonces, demandes de places, acceptation, annulation,
 * signalement. Les numéros ne sont échangés qu'après acceptation (voir
 * rides.mapper.ts). Rien n'est payé dans l'app.
 */
@Injectable()
export class RidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Lecture ------------------------------------------------------------------------

  /** Trajets ouverts des 7 prochains jours, du plus proche au plus lointain. */
  async search(viewerId: string, query: RideSearchQuery, now = new Date()): Promise<RideOffer[]> {
    const offers = await this.prisma.rideOffer.findMany({
      where: {
        status: 'ACTIVE',
        departureAt: { gt: now, lte: new Date(now.getTime() + RIDE_RULES.maxDaysAhead * DAY_MS) },
        ...(query.from && { fromLocalityId: query.from }),
        ...(query.to && { toLocalityId: query.to }),
      },
      include: rideInclude,
      orderBy: { departureAt: 'asc' },
      take: 50,
    });
    return offers.map((offer) => toRideOffer(offer, viewerId));
  }

  async detail(viewerId: string, id: string): Promise<RideOfferDetail> {
    return toRideDetail(await this.load(id), viewerId);
  }

  /** Mes annonces et les trajets où j'ai demandé une place (depuis hier). */
  async mine(userId: string, now = new Date()): Promise<MyRides> {
    const since = new Date(now.getTime() - DAY_MS);
    const [offers, requested] = await Promise.all([
      this.prisma.rideOffer.findMany({
        where: { driverId: userId, departureAt: { gt: since } },
        include: rideInclude,
        orderBy: { departureAt: 'asc' },
      }),
      this.prisma.rideOffer.findMany({
        where: {
          departureAt: { gt: since },
          requests: { some: { passengerId: userId, status: { not: 'CANCELLED' } } },
        },
        include: rideInclude,
        orderBy: { departureAt: 'asc' },
      }),
    ]);
    return {
      offers: offers.map((offer) => toRideDetail(offer, userId)),
      requested: requested.map((offer) => toRideOffer(offer, userId)),
    };
  }

  // --- Conducteur -------------------------------------------------------------------

  async create(
    driverId: string,
    input: CreateRideOfferInput,
    now = new Date(),
  ): Promise<RideOfferDetail> {
    await this.checkMember(driverId);
    const departureAt = new Date(input.departureAt);
    const delay = departureAt.getTime() - now.getTime();
    if (delay < RIDE_RULES.minMinutesBeforeDeparture * 60_000) {
      throw new BadRequestException('Le départ doit être dans au moins 10 minutes.');
    }
    if (delay > RIDE_RULES.maxDaysAhead * DAY_MS) {
      throw new BadRequestException('Le départ doit être dans les 7 prochains jours.');
    }
    const localities = await this.prisma.locality.count({
      where: { id: { in: [input.fromLocalityId, input.toLocalityId] } },
    });
    if (localities !== 2) throw new NotFoundException('Localité introuvable.');

    const active = await this.prisma.rideOffer.count({
      where: { driverId, status: 'ACTIVE', departureAt: { gt: now } },
    });
    if (active >= RIDE_RULES.maxActiveOffersPerDriver) {
      throw new ConflictException(
        `Tu as déjà ${RIDE_RULES.maxActiveOffersPerDriver} trajets en cours.`,
      );
    }

    const offer = await this.prisma.rideOffer.create({
      data: {
        driverId,
        fromLocalityId: input.fromLocalityId,
        toLocalityId: input.toLocalityId,
        departureAt,
        seats: input.seats,
        priceMillimes: input.priceMillimes,
      },
      include: rideInclude,
    });
    return toRideDetail(offer, driverId);
  }

  /** Annulation par le conducteur : les passagers (en attente ou acceptés) sont prévenus. */
  async cancel(driverId: string, id: string, now = new Date()): Promise<RideOfferDetail> {
    const offer = await this.loadOwn(driverId, id);
    return toRideDetail(await this.cancelOffer(offer, now), driverId);
  }

  /**
   * Annulation sans le conducteur : par un modérateur (annonce signalée) ou à la
   * suppression de son compte. Mêmes effets : les passagers sont prévenus.
   */
  async forceCancel(id: string, now = new Date()): Promise<void> {
    await this.cancelOffer(await this.load(id), now);
  }

  private async cancelOffer(offer: RideWithRelations, now: Date): Promise<RideWithRelations> {
    const id = offer.id;
    if (offer.status === 'CANCELLED') return offer;
    const { count } = await this.prisma.rideOffer.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: now },
    });
    const updated = await this.load(id);
    if (count === 1 && offer.departureAt > now) {
      for (const request of updated.requests) {
        if (request.status === 'PENDING' || request.status === 'ACCEPTED') {
          await this.notify(
            'RIDE_CANCELLED',
            request.passengerId,
            updated,
            request.seats,
            request.id,
          );
        }
      }
    }
    return updated;
  }

  /**
   * Accepter ou refuser une demande. L'acceptation se fait dans une transaction
   * qui VERROUILLE l'annonce (FOR UPDATE) : deux acceptations simultanées ne
   * peuvent pas dépasser le nombre de places.
   */
  async respond(
    driverId: string,
    offerId: string,
    requestId: string,
    accept: boolean,
    now = new Date(),
  ): Promise<RideOfferDetail> {
    const offer = await this.loadOwn(driverId, offerId);
    if (!isRideOpen(offer, now)) throw new ConflictException('Ce trajet n’est plus ouvert.');
    const request = offer.requests.find((r) => r.id === requestId);
    if (!request) throw new NotFoundException('Demande introuvable.');
    if (request.status !== 'PENDING') {
      throw new ConflictException('Cette demande a déjà reçu une réponse.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ride_offers WHERE id = ${offerId}::uuid FOR UPDATE`;
      if (accept) {
        const accepted = await tx.rideRequest.aggregate({
          where: { offerId, status: 'ACCEPTED' },
          _sum: { seats: true },
        });
        if (seatsLeft(offer.seats, accepted._sum.seats ?? 0) < request.seats) {
          throw new ConflictException('Il ne reste pas assez de places.');
        }
      }
      // Conditionnel : si la demande a changé entre-temps (annulée…), rien ne se passe.
      const { count } = await tx.rideRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: now },
      });
      if (count !== 1) throw new ConflictException('Cette demande a déjà reçu une réponse.');
    });

    const updated = await this.load(offerId);
    await this.notify(
      accept ? 'RIDE_ACCEPTED' : 'RIDE_DECLINED',
      request.passengerId,
      updated,
      request.seats,
      request.id,
    );
    return toRideDetail(updated, driverId);
  }

  // --- Passager ----------------------------------------------------------------------

  async requestSeats(
    passengerId: string,
    offerId: string,
    seats: number,
    now = new Date(),
  ): Promise<RideOfferDetail> {
    const offer = await this.load(offerId);
    if (offer.driverId === passengerId) {
      throw new ForbiddenException('Tu ne peux pas demander une place dans ton propre trajet.');
    }
    if (!isRideOpen(offer, now)) throw new ConflictException('Ce trajet n’est plus ouvert.');
    await this.checkMember(passengerId);

    const existing = offer.requests.find((r) => r.passengerId === passengerId);
    if (existing && existing.status !== 'CANCELLED') {
      throw new ConflictException(
        existing.status === 'DECLINED'
          ? 'Le conducteur a déjà refusé ta demande pour ce trajet.'
          : 'Tu as déjà demandé une place pour ce trajet.',
      );
    }
    const recent = await this.prisma.rideRequest.count({
      where: { passengerId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    });
    if (recent >= RIDE_RULES.maxRequestsPerDay) {
      throw new HttpException(
        'Trop de demandes aujourd’hui. Réessaie demain.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const accepted = offer.requests
      .filter((r) => r.status === 'ACCEPTED')
      .reduce((sum, r) => sum + r.seats, 0);
    if (seatsLeft(offer.seats, accepted) < seats) {
      throw new ConflictException('Il ne reste pas assez de places.');
    }

    // Une demande annulée peut être refaite : on réutilise sa ligne (une seule par passager).
    const request = existing
      ? await this.prisma.rideRequest.update({
          where: { id: existing.id },
          data: { seats, status: 'PENDING', createdAt: now, respondedAt: null },
        })
      : await this.prisma.rideRequest.create({ data: { offerId, passengerId, seats } });

    const updated = await this.load(offerId);
    await this.notify(
      'RIDE_REQUESTED',
      offer.driverId,
      updated,
      seats,
      `${request.id}:${now.getTime()}`,
    );
    return toRideDetail(updated, passengerId);
  }

  async cancelRequest(
    passengerId: string,
    offerId: string,
    now = new Date(),
  ): Promise<RideOfferDetail> {
    const offer = await this.load(offerId);
    const own = offer.requests.find((r) => r.passengerId === passengerId);
    if (!own) throw new NotFoundException('Demande introuvable.');
    await this.prisma.rideRequest.updateMany({
      where: { id: own.id, status: { in: ['PENDING', 'ACCEPTED'] } },
      data: { status: 'CANCELLED', respondedAt: now },
    });
    return toRideDetail(await this.load(offerId), passengerId);
  }

  /** Signaler une annonce (une fois par utilisateur) : traité par la modération (phase 10). */
  async flag(userId: string, offerId: string, reason: RideFlagReason): Promise<void> {
    const offer = await this.load(offerId);
    if (offer.driverId === userId) {
      throw new ForbiddenException('Tu ne peux pas signaler ton propre trajet.');
    }
    await this.prisma.rideFlag.createMany({
      data: { offerId, reporterId: userId, reason },
      skipDuplicates: true,
    });
  }

  // --- Interne ---------------------------------------------------------------------------

  /** Conditions pour publier ou demander : un téléphone, et un score de confiance correct. */
  private async checkMember(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true, trustScore: true },
    });
    if (!user.phone) {
      throw new BadRequestException(
        'Ajoute ton numéro de téléphone dans le Profil : il n’est donné qu’après acceptation.',
      );
    }
    if (user.trustScore < RIDE_RULES.minTrustScore) {
      throw new ForbiddenException(
        'Ton score de confiance ne permet pas d’utiliser le covoiturage.',
      );
    }
  }

  private async load(id: string): Promise<RideWithRelations> {
    const offer = await this.prisma.rideOffer.findUnique({ where: { id }, include: rideInclude });
    if (!offer) throw new NotFoundException('Trajet introuvable.');
    return offer;
  }

  /** L'annonce de ce conducteur (404 pour celle d'un autre : on ne révèle rien). */
  private async loadOwn(driverId: string, id: string): Promise<RideWithRelations> {
    const offer = await this.load(id);
    if (offer.driverId !== driverId) throw new NotFoundException('Trajet introuvable.');
    return offer;
  }

  private notify(
    type: RideNotificationType,
    userId: string,
    offer: RideWithRelations,
    seats: number,
    key: string,
  ) {
    return this.notifications.notify(
      userId,
      {
        type,
        data: {
          offerId: offer.id,
          fromNameFr: offer.from.nameFr,
          fromNameAr: offer.from.nameAr,
          toNameFr: offer.to.nameFr,
          toNameAr: offer.to.nameAr,
          departureAt: offer.departureAt.toISOString(),
          seats,
        },
      },
      `${type.toLowerCase()}:${key}`,
    );
  }
}
