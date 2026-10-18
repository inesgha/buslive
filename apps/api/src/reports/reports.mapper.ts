import type { Report as ReportDto } from '@buslive/shared';

import type { Prisma } from '../generated/prisma/client';

/**
 * Identifiant qui ne correspond à aucun utilisateur : quand personne n'est
 * connecté, la sélection « mon vote » ne renvoie donc rien.
 */
const NO_VIEWER = '00000000-0000-0000-0000-000000000000';

/** Relations à charger pour afficher un signalement (avec le vote de l'utilisateur connecté). */
export function reportInclude(viewerId?: string) {
  return {
    line: { select: { id: true, code: true, color: true, nameFr: true, nameAr: true } },
    direction: true,
    stop: { select: { id: true, nameFr: true, nameAr: true } },
    votes: { where: { userId: viewerId ?? NO_VIEWER }, select: { value: true } },
  } satisfies Prisma.ReportInclude;
}

export type ReportWithRelations = Prisma.ReportGetPayload<{
  include: ReturnType<typeof reportInclude>;
}>;

/**
 * Signalement → format de l'API. Aucune information sur l'auteur n'est
 * renvoyée, seulement « mine » pour l'utilisateur connecté.
 */
export function toReportDto(report: ReportWithRelations, viewerId?: string): ReportDto {
  return {
    id: report.id,
    type: report.type,
    status: report.status,
    line: report.line,
    direction: report.direction
      ? {
          id: report.direction.id,
          direction: report.direction.direction,
          headsignFr: report.direction.headsignFr,
          headsignAr: report.direction.headsignAr,
        }
      : null,
    stop: report.stop,
    serviceDate: report.serviceDate ? report.serviceDate.toISOString().slice(0, 10) : null,
    scheduledMinutes: report.scheduledMinutes,
    delayMinutes: report.delayMinutes,
    confirmations: report.confirmCount,
    denials: report.denyCount,
    createdAt: report.createdAt.toISOString(),
    expiresAt: report.expiresAt.toISOString(),
    mine: viewerId !== undefined && report.userId === viewerId,
    myVote: report.votes[0]?.value ?? null,
  };
}
