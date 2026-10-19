import {
  type CreateReportInput,
  distanceMeters,
  minutesUntil,
  type Report as ReportDto,
  reportLifetimeMinutes,
  resolveReport,
  STOP_TIMED_REPORT_TYPES,
  TRUST_RULES,
  tunisClock,
  type VoteValue,
} from '@buslive/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { Prisma, type Report } from '../generated/prisma/client';
import { LiveBroadcaster } from '../live/live.broadcaster';
import { VISIBLE_LINE, VISIBLE_STOP } from '../network/network.filters';
import { PrismaService } from '../prisma/prisma.service';
import { ReportEvents } from './reports.events';
import { reportInclude, type ReportWithRelations, toReportDto } from './reports.mapper';
import { TrustService } from './trust.service';

type Tx = Prisma.TransactionClient;
type Decision = 'CONFIRMED' | 'REJECTED';

/** Un horaire concerné peut être passé de 3 h au plus, ou à venir dans 2 h au plus. */
const MAX_MINUTES_SINCE_SCHEDULE = 180;
const MAX_MINUTES_BEFORE_SCHEDULE = 120;
/** Un arrêt « déplacé » ne peut pas l'être de plus de 1 km. */
const MAX_STOP_MOVE_METERS = 1000;
/** Une observation prouve un signalement si elle est à ± 15 min de l'horaire concerné… */
const EVIDENCE_SCHEDULE_TOLERANCE_MINUTES = 15;
/** … ou, sans horaire, à ± 45 min de l'envoi du signalement. */
const EVIDENCE_TIME_TOLERANCE_MS = 45 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60_000;

/** Passage réel observé (voir ObservationsService). */
export interface Observation {
  lineId: string;
  directionId: string;
  stopId: string;
  observedAt: Date;
}

/**
 * Signalements : création (avec contrôles et fusion des doublons), votes,
 * décision (confirmé / démenti), versement des points, preuves automatiques
 * venant du direct, expiration.
 */
@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly trust: TrustService,
    private readonly broadcaster: LiveBroadcaster,
    private readonly events: ReportEvents,
  ) {}

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      void this.expireDue().catch((error: Error) =>
        this.logger.warn(`Expiration des signalements impossible : ${error.message}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // --- Création -------------------------------------------------------------

  async create(userId: string, input: CreateReportInput, now = new Date()): Promise<ReportDto> {
    await this.checkHourlyLimit(userId, now);
    const { stop, minutesUntilScheduled } = await this.validate(input, now);

    // Doublon : le même problème est déjà signalé → c'est une confirmation.
    const duplicate = await this.findDuplicate(input, now, userId);
    if (duplicate) {
      const alreadyVoted = duplicate.votes.length > 0;
      if (duplicate.userId === userId || alreadyVoted || duplicate.status !== 'ACTIVE') {
        return toReportDto(duplicate, userId);
      }
      return this.vote(userId, duplicate.id, 'CONFIRM', now);
    }

    const { score, weight } = await this.trust.weightOf(userId);
    const created = await this.prisma.report.create({
      data: {
        userId,
        type: input.type,
        lineId: input.lineId,
        directionId: input.directionId ?? null,
        stopId: input.stopId ?? null,
        serviceDate: input.serviceDate ? new Date(`${input.serviceDate}T00:00:00Z`) : null,
        scheduledMinutes: input.scheduledMinutes ?? null,
        delayMinutes: input.delayMinutes ?? null,
        // Seule la distance à l'arrêt est gardée, pas la position de l'auteur.
        reporterDistanceMeters:
          input.position && stop ? Math.round(distanceMeters(input.position, stop)) : null,
        proposedLatitude: input.type === 'STOP_MOVED' ? (input.position?.latitude ?? null) : null,
        proposedLongitude: input.type === 'STOP_MOVED' ? (input.position?.longitude ?? null) : null,
        confirmWeight: weight,
        hidden: score < TRUST_RULES.hiddenBelowScore,
        expiresAt: new Date(
          now.getTime() + reportLifetimeMinutes(input.type, minutesUntilScheduled) * 60_000,
        ),
      },
    });

    // Un bus en direct est déjà passé à cet arrêt ? C'est une preuve immédiate.
    if (created.type === 'NOT_CAME' || created.type === 'PASSED') {
      const observations = await this.prisma.stopPassageObservation.findMany({
        where: {
          directionId: created.directionId ?? undefined,
          stopId: created.stopId ?? undefined,
          observedAt: { gte: new Date(now.getTime() - EVIDENCE_TIME_TOLERANCE_MS) },
        },
      });
      for (const observation of observations) {
        await this.applyEvidenceTo(created, observation);
      }
    }

    const report = await this.load(created.id, userId);
    this.publish(report);
    return toReportDto(report, userId);
  }

  // --- Votes ----------------------------------------------------------------

  async vote(
    userId: string,
    reportId: string,
    value: VoteValue,
    now = new Date(),
  ): Promise<ReportDto> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report || report.expiresAt <= now) throw new NotFoundException('Signalement introuvable.');
    if (report.status !== 'ACTIVE') throw new ConflictException('Ce signalement est déjà clos.');
    if (report.userId === userId) {
      throw new ForbiddenException('Tu ne peux pas voter pour ton propre signalement.');
    }

    const { weight } = await this.trust.weightOf(userId);
    let decision: Decision | null;
    try {
      decision = await this.prisma.$transaction((tx) =>
        this.addVote(tx, report, { userId, source: 'USER', value, weight }, now),
      );
    } catch (error) {
      // Contrainte d'unicité (reportId, userId) : déjà voté (y compris en parallèle).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tu as déjà donné ton avis sur ce signalement.');
      }
      throw error;
    }

    this.announce(reportId, decision, now);
    const updated = await this.load(reportId, userId);
    this.publish(updated);
    return toReportDto(updated, userId);
  }

  // --- Modération (phase 10) ---------------------------------------------------

  /**
   * Décision d'un modérateur : tranche le signalement par le MÊME chemin que les
   * votes (finalize : points versés une seule fois, historique). « record » écrit
   * le journal de modération dans la même transaction.
   */
  async moderate(
    reportId: string,
    decision: Decision,
    record: (tx: Tx) => Promise<void>,
    now = new Date(),
  ): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.status !== 'ACTIVE') throw new ConflictException('Ce signalement est déjà clos.');
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.finalize(tx, report, decision, now))) {
        throw new ConflictException('Ce signalement est déjà clos.');
      }
      await record(tx);
    });
    this.announce(reportId, decision, now);
    this.publish(await this.load(reportId));
  }

  // --- Lecture --------------------------------------------------------------

  /** Signalements visibles d'une ligne (actifs ou confirmés, non expirés). */
  async listForLine(lineId: string, viewerId?: string, now = new Date()): Promise<ReportDto[]> {
    const line = await this.prisma.line.findFirst({ where: { id: lineId, ...VISIBLE_LINE } });
    if (!line) throw new NotFoundException('Ligne introuvable.');
    return this.list({ lineId }, viewerId, now);
  }

  /**
   * Signalements qui concernent un arrêt : ceux de l'arrêt, plus « plein » et
   * « panne » sur les sens qui le desservent (ils touchent aussi cet arrêt).
   */
  async listForStop(
    stopId: string,
    servingDirectionIds: string[],
    viewerId?: string,
    now = new Date(),
  ): Promise<ReportDto[]> {
    return this.list(
      {
        OR: [
          { stopId },
          { type: { in: ['FULL', 'BREAKDOWN'] }, directionId: { in: servingDirectionIds } },
        ],
      },
      viewerId,
      now,
    );
  }

  private async list(
    where: Prisma.ReportWhereInput,
    viewerId: string | undefined,
    now: Date,
  ): Promise<ReportDto[]> {
    const reports = await this.prisma.report.findMany({
      where: {
        ...where,
        status: { in: ['ACTIVE', 'CONFIRMED'] },
        expiresAt: { gt: now },
        // Les signalements cachés (auteur au score très bas) ne sont vus que par leur auteur.
        OR: [{ hidden: false }, ...(viewerId ? [{ userId: viewerId }] : [])],
      },
      include: reportInclude(viewerId),
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return reports.map((report) => toReportDto(report, viewerId));
  }

  // --- Preuves automatiques (bus en direct) ---------------------------------

  /**
   * Un bus en direct vient de passer à un arrêt : les « pas venu » de cet
   * arrêt sont contredits, les « bus passé » confirmés.
   */
  async applyLiveEvidence(observation: Observation): Promise<void> {
    const reports = await this.prisma.report.findMany({
      where: {
        status: 'ACTIVE',
        type: { in: ['NOT_CAME', 'PASSED'] },
        lineId: observation.lineId,
        directionId: observation.directionId,
        stopId: observation.stopId,
        expiresAt: { gt: observation.observedAt },
      },
    });
    for (const report of reports) {
      if (await this.applyEvidenceTo(report, observation)) {
        this.publish(await this.load(report.id));
      }
    }
  }

  /** Renvoie true si la preuve a été appliquée. */
  private async applyEvidenceTo(report: Report, observation: Observation): Promise<boolean> {
    if (!evidenceMatches(report, observation.observedAt)) return false;
    const existing = await this.prisma.reportVote.findFirst({
      where: { reportId: report.id, source: 'LIVE' },
    });
    if (existing) return false;
    const decision = await this.prisma.$transaction((tx) =>
      this.addVote(
        tx,
        report,
        {
          userId: null,
          source: 'LIVE',
          // Un bus est passé : « pas venu » est faux, « bus passé » est vrai.
          value: report.type === 'NOT_CAME' ? 'DENY' : 'CONFIRM',
          weight: TRUST_RULES.liveEvidenceWeight,
        },
        observation.observedAt,
      ),
    );
    this.announce(report.id, decision, observation.observedAt);
    return true;
  }

  // --- Expiration -----------------------------------------------------------

  /** Les signalements restés sans décision expirent (sans points). */
  async expireDue(now = new Date()): Promise<number> {
    const { count } = await this.prisma.report.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', resolvedAt: now },
    });
    return count;
  }

  // --- Interne ----------------------------------------------------------------

  /**
   * Enregistre un vote, met à jour les poids et décide si le seuil est atteint.
   * Renvoie la décision si CE vote a clos le signalement, sinon null.
   */
  private async addVote(
    tx: Tx,
    report: Report,
    vote: { userId: string | null; source: 'USER' | 'LIVE'; value: VoteValue; weight: number },
    now: Date,
  ): Promise<Decision | null> {
    await tx.reportVote.create({ data: { reportId: report.id, ...vote } });
    const confirm = vote.value === 'CONFIRM';
    const fromUser = vote.source === 'USER';
    const updated = await tx.report.update({
      where: { id: report.id },
      data: {
        confirmWeight: { increment: confirm ? vote.weight : 0 },
        denyWeight: { increment: confirm ? 0 : vote.weight },
        confirmCount: { increment: confirm && fromUser ? 1 : 0 },
        denyCount: { increment: !confirm && fromUser ? 1 : 0 },
      },
    });
    const decision = resolveReport(updated);
    if (decision && (await this.finalize(tx, updated, decision, now))) return decision;
    return null;
  }

  /**
   * Clôt le signalement et verse les points : l'auteur (+10 / −15) et chaque
   * votant (+2 s'il avait raison, −3 sinon). La mise à jour conditionnelle
   * (statut encore ACTIVE) garantit que les points ne sont versés qu'une fois.
   * Renvoie false si le signalement était déjà clos.
   */
  private async finalize(tx: Tx, report: Report, decision: Decision, now: Date): Promise<boolean> {
    const { count } = await tx.report.updateMany({
      where: { id: report.id, status: 'ACTIVE' },
      data: {
        status: decision,
        resolvedAt: now,
        ...(decision === 'CONFIRMED' && { hidden: false }),
      },
    });
    if (count !== 1) return false;

    const confirmed = decision === 'CONFIRMED';
    await this.trust.award(
      tx,
      report.userId,
      confirmed ? 'REPORT_CONFIRMED' : 'REPORT_REJECTED',
      report.id,
    );
    const votes = await tx.reportVote.findMany({ where: { reportId: report.id, source: 'USER' } });
    for (const vote of votes) {
      if (!vote.userId) continue;
      const right = (vote.value === 'CONFIRM') === confirmed;
      await this.trust.award(tx, vote.userId, right ? 'VOTE_CORRECT' : 'VOTE_WRONG', report.id);
    }
    return true;
  }

  /**
   * Prévient les autres modules (notifications) qu'un signalement est tranché.
   * Appelé APRÈS la transaction : on n'annonce jamais une décision annulée.
   */
  private announce(reportId: string, decision: Decision | null, resolvedAt: Date): void {
    if (decision) this.events.emit('reportResolved', { reportId, status: decision, resolvedAt });
  }

  private async checkHourlyLimit(userId: string, now: Date): Promise<void> {
    const lastHour = await this.prisma.report.count({
      where: { userId, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (lastHour >= TRUST_RULES.maxReportsPerHour) {
      throw new HttpException(
        'Trop de signalements en une heure. Réessaie plus tard.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Vérifie la cohérence ligne / sens / arrêt / horaire / position. */
  private async validate(input: CreateReportInput, now: Date) {
    const line = await this.prisma.line.findFirst({ where: { id: input.lineId, ...VISIBLE_LINE } });
    if (!line) throw new NotFoundException('Ligne introuvable.');

    if (input.directionId) {
      const direction = await this.prisma.lineDirection.findFirst({
        where: { id: input.directionId, lineId: input.lineId },
      });
      if (!direction) throw new NotFoundException('Sens introuvable pour cette ligne.');
    }

    let stop: { latitude: number; longitude: number } | null = null;
    if (input.stopId) {
      stop = await this.prisma.stop.findFirst({
        where: {
          id: input.stopId,
          ...VISIBLE_STOP,
          // L'arrêt doit être desservi par ce sens (ou, pour « arrêt déplacé », par la ligne).
          lineStops: {
            some: input.directionId
              ? { directionId: input.directionId }
              : { direction: { lineId: input.lineId } },
          },
        },
        select: { latitude: true, longitude: true },
      });
      if (!stop) throw new NotFoundException('Arrêt introuvable sur cette ligne.');
    }

    let minutesUntilScheduled: number | undefined;
    if (input.serviceDate !== undefined && input.scheduledMinutes !== undefined) {
      minutesUntilScheduled = minutesUntil(
        { serviceDate: input.serviceDate, passingMinutes: input.scheduledMinutes },
        tunisClock(now),
      );
      if (
        minutesUntilScheduled < -MAX_MINUTES_SINCE_SCHEDULE ||
        minutesUntilScheduled > MAX_MINUTES_BEFORE_SCHEDULE
      ) {
        throw new BadRequestException('L’horaire concerné est trop éloigné de maintenant.');
      }
    }

    if (input.type === 'STOP_MOVED' && input.position && stop) {
      if (distanceMeters(input.position, stop) > MAX_STOP_MOVE_METERS) {
        throw new BadRequestException('La nouvelle position est trop loin de l’arrêt actuel.');
      }
    }

    // Les types liés à un horaire sont ceux où l'arrêt est obligatoire (schéma partagé).
    if (STOP_TIMED_REPORT_TYPES.includes(input.type) && !stop) {
      throw new BadRequestException('L’arrêt est obligatoire.');
    }
    return { stop, minutesUntilScheduled };
  }

  /** Signalement identique encore en cours (avec le vote éventuel de cet utilisateur). */
  private findDuplicate(input: CreateReportInput, now: Date, userId: string) {
    return this.prisma.report.findFirst({
      where: {
        type: input.type,
        lineId: input.lineId,
        directionId: input.directionId ?? null,
        stopId: input.stopId ?? null,
        serviceDate: input.serviceDate ? new Date(`${input.serviceDate}T00:00:00Z`) : null,
        scheduledMinutes: input.scheduledMinutes ?? null,
        status: { in: ['ACTIVE', 'CONFIRMED'] },
        expiresAt: { gt: now },
      },
      include: reportInclude(userId),
    });
  }

  private load(reportId: string, viewerId?: string): Promise<ReportWithRelations> {
    return this.prisma.report.findUniqueOrThrow({
      where: { id: reportId },
      include: reportInclude(viewerId),
    });
  }

  /** Diffuse le signalement aux spectateurs de la ligne (sauf s'il est caché). */
  private publish(report: ReportWithRelations): void {
    if (report.hidden) return;
    this.broadcaster.emitReport({ lineId: report.lineId, report: toReportDto(report) });
  }
}

/**
 * Une observation (bus passé à l'arrêt à « observedAt ») concerne-t-elle ce
 * signalement ? Avec un horaire précis : à ± 15 min de cet horaire. Sinon :
 * à ± 45 min de l'envoi du signalement.
 */
export function evidenceMatches(report: Report, observedAt: Date): boolean {
  if (report.serviceDate && report.scheduledMinutes !== null) {
    const gap = minutesUntil(
      {
        serviceDate: report.serviceDate.toISOString().slice(0, 10),
        passingMinutes: report.scheduledMinutes,
      },
      tunisClock(observedAt),
    );
    return Math.abs(gap) <= EVIDENCE_SCHEDULE_TOLERANCE_MINUTES;
  }
  return Math.abs(report.createdAt.getTime() - observedAt.getTime()) <= EVIDENCE_TIME_TOLERANCE_MS;
}
