import { randomUUID } from 'node:crypto';

import {
  STOP_PROPOSAL_RULES,
  type StopProposal,
  type StopProposalInput,
  StopProposalInputSchema,
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

import type { Stop } from '../generated/prisma/client';
import { VISIBLE_LINE } from '../network/network.filters';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Un arrêt proposé doit être à moins de 30 km d'un arrêt existant d'un gouvernorat ouvert. */
const MAX_DISTANCE_FROM_NETWORK_METERS = 30_000;

/**
 * Arrêts proposés par les passagers (app mobile). Un arrêt proposé est créé
 * avec le statut PENDING : il reste INVISIBLE dans l'app (filtres VISIBLE_*)
 * tant qu'un modérateur ne l'a pas approuvé.
 */
@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async propose(userId: string, raw: StopProposalInput, now = new Date()): Promise<StopProposal> {
    const input = StopProposalInputSchema.parse(raw);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { trustScore: true },
    });
    if (user.trustScore < STOP_PROPOSAL_RULES.minTrustScore) {
      throw new ForbiddenException('Ton score de confiance ne permet pas de proposer un arrêt.');
    }
    const today = await this.prisma.stop.count({
      where: { proposedById: userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
    });
    if (today >= STOP_PROPOSAL_RULES.maxPerDay) {
      throw new HttpException(
        'Trop de propositions aujourd’hui. Réessaie demain.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Doublon : un arrêt (actif ou déjà proposé) existe tout près.
    const [duplicate] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM stops
      WHERE status IN ('ACTIVE', 'PENDING')
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${input.longitude}::double precision, ${input.latitude}::double precision), 4326)::geography,
          ${STOP_PROPOSAL_RULES.minDistanceMeters}::double precision
        )
      LIMIT 1
    `;
    if (duplicate) throw new ConflictException('Un arrêt existe déjà à cet endroit.');

    // Gouvernorat et localité : ceux de l'arrêt existant le plus proche, dans une zone ouverte.
    const [nearest] = await this.prisma.$queryRaw<
      { governorate_id: string; locality_id: string | null }[]
    >`
      SELECT s.governorate_id, s.locality_id
      FROM stops s
      JOIN governorates g ON g.id = s.governorate_id AND g.is_active
      WHERE s.status = 'ACTIVE'
        AND ST_DWithin(
          s.location,
          ST_SetSRID(ST_MakePoint(${input.longitude}::double precision, ${input.latitude}::double precision), 4326)::geography,
          ${MAX_DISTANCE_FROM_NETWORK_METERS}::double precision
        )
      ORDER BY s.location <-> ST_SetSRID(ST_MakePoint(${input.longitude}::double precision, ${input.latitude}::double precision), 4326)::geography
      LIMIT 1
    `;
    if (!nearest) {
      throw new BadRequestException('Cette zone n’est pas encore couverte par BusLive.');
    }

    const lineIds = [...new Set(input.lineIds)];
    const lines = await this.prisma.line.count({ where: { id: { in: lineIds }, ...VISIBLE_LINE } });
    if (lines !== lineIds.length) throw new NotFoundException('Ligne introuvable.');

    const stop = await this.prisma.stop.create({
      data: {
        code: `proposition-${randomUUID().slice(0, 8)}`,
        nameFr: input.nameFr,
        // Sans nom arabe, le nom français sert en attendant : un modérateur pourra le corriger.
        nameAr: input.nameAr ?? input.nameFr,
        latitude: input.latitude,
        longitude: input.longitude,
        governorateId: nearest.governorate_id,
        localityId: nearest.locality_id,
        status: 'PENDING',
        proposedById: userId,
        proposedLineIds: lineIds,
      },
    });
    return (await this.toDtos([stop]))[0]!;
  }

  /** Mes propositions, les plus récentes d'abord. */
  async mine(userId: string): Promise<StopProposal[]> {
    const stops = await this.prisma.stop.findMany({
      where: { proposedById: userId, status: { in: ['PENDING', 'ACTIVE', 'REJECTED'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return this.toDtos(stops);
  }

  private async toDtos(stops: Stop[]): Promise<StopProposal[]> {
    const lines = await this.prisma.line.findMany({
      where: { id: { in: stops.flatMap((stop) => stop.proposedLineIds) } },
      select: { id: true, code: true, color: true },
    });
    const byId = new Map(lines.map((line) => [line.id, line]));
    return stops.map((stop) => ({
      id: stop.id,
      nameFr: stop.nameFr,
      nameAr: stop.nameAr,
      latitude: stop.latitude,
      longitude: stop.longitude,
      status: stop.status as StopProposal['status'],
      lines: stop.proposedLineIds.flatMap((id) => byId.get(id) ?? []),
      createdAt: stop.createdAt.toISOString(),
    }));
  }
}
