import { z } from 'zod';

import type { ReportType } from './reports';

/**
 * Score de confiance : chaque utilisateur gagne des points quand ses
 * signalements sont confirmés et en perd quand ils sont démentis. Plus le score
 * est élevé, plus son avis pèse. Les erreurs coûtent plus cher qu'elles ne
 * rapportent, pour décourager les faux signalements.
 */
export const TRUST_RULES = {
  minScore: -100,
  maxScore: 1000,
  /** Points gagnés / perdus. */
  points: {
    REPORT_CONFIRMED: 10,
    REPORT_REJECTED: -15,
    VOTE_CORRECT: 2,
    VOTE_WRONG: -3,
    SHARING_COMPLETED: 2,
  },
  /** Partages récompensés au plus par jour. */
  maxRewardedSharingsPerDay: 3,
  /** Un partage est « mené à bien » au-delà de ces seuils. */
  sharingMinAcceptedPositions: 10,
  sharingMinMinutes: 5,
  /** Poids : 1 + score / weightDivisor, borné. */
  weightDivisor: 50,
  minWeight: 0.25,
  maxWeight: 3,
  /** Total des poids « pour » (auteur compris) qui confirme un signalement. */
  confirmThreshold: 3,
  /** Avance des poids « contre » sur les poids « pour » qui dément un signalement. */
  rejectMargin: 2,
  /** Poids d'une preuve automatique (bus en direct observé à l'arrêt). */
  liveEvidenceWeight: 3,
  /** Sous ce score, les signalements restent cachés tant qu'ils ne sont pas confirmés. */
  hiddenBelowScore: -50,
  /** Signalements au plus par heure et par utilisateur. */
  maxReportsPerHour: 10,
} as const;

export const TRUST_LEVELS = ['NEW', 'TRUSTED', 'EXPERT'] as const;
export const TrustLevelSchema = z.enum(TRUST_LEVELS);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

export const TRUST_EVENT_REASONS = [
  'REPORT_CONFIRMED',
  'REPORT_REJECTED',
  'VOTE_CORRECT',
  'VOTE_WRONG',
  'SHARING_COMPLETED',
] as const;
export const TrustEventReasonSchema = z.enum(TRUST_EVENT_REASONS);
export type TrustEventReason = z.infer<typeof TrustEventReasonSchema>;

/** Garde le score dans ses bornes. */
export function clampScore(score: number): number {
  return Math.min(TRUST_RULES.maxScore, Math.max(TRUST_RULES.minScore, Math.round(score)));
}

/** Poids de l'avis d'un utilisateur : nouveau = 1, score 100 = 3 (maximum), score négatif → 0,25. */
export function voteWeight(score: number): number {
  const weight = 1 + score / TRUST_RULES.weightDivisor;
  return Math.min(TRUST_RULES.maxWeight, Math.max(TRUST_RULES.minWeight, weight));
}

/** Niveau affiché : Nouveau (< 20), Fiable (20 à 99), Expert (≥ 100). */
export function trustLevel(score: number): TrustLevel {
  if (score >= 100) return 'EXPERT';
  if (score >= 20) return 'TRUSTED';
  return 'NEW';
}

/**
 * Décision sur un signalement à partir des poids cumulés.
 * null = pas encore de décision (on attend d'autres avis).
 */
export function resolveReport(weights: {
  confirmWeight: number;
  denyWeight: number;
}): 'CONFIRMED' | 'REJECTED' | null {
  if (weights.denyWeight >= weights.confirmWeight + TRUST_RULES.rejectMargin) return 'REJECTED';
  if (weights.confirmWeight >= TRUST_RULES.confirmThreshold) return 'CONFIRMED';
  return null;
}

/** Durée de vie d'un signalement selon son type (minutes). */
export const REPORT_LIFETIME_MINUTES: Record<ReportType, number> = {
  NOT_CAME: 45,
  PASSED: 45,
  DELAYED: 45,
  FULL: 30,
  BREAKDOWN: 120,
  STOP_MOVED: 7 * 24 * 60,
};

/** Durée de vie minimale, même pour un horaire déjà un peu passé (minutes). */
export const REPORT_MIN_LIFETIME_MINUTES = 10;

/**
 * Minutes avant l'expiration d'un signalement.
 * Pour « pas venu », « passé » et « retard », on compte à partir de l'horaire
 * concerné (minutesUntilScheduled, négatif s'il est passé) quand il est connu.
 */
export function reportLifetimeMinutes(type: ReportType, minutesUntilScheduled?: number): number {
  const lifetime = REPORT_LIFETIME_MINUTES[type];
  const fromSchedule =
    minutesUntilScheduled !== undefined && ['NOT_CAME', 'PASSED', 'DELAYED'].includes(type)
      ? minutesUntilScheduled + lifetime
      : lifetime;
  return Math.max(REPORT_MIN_LIFETIME_MINUTES, fromSchedule);
}

// --- Réponses ---------------------------------------------------------------

export const TrustSummarySchema = z.object({
  score: z.number().int(),
  level: TrustLevelSchema,
  /** Poids actuel de l'avis de l'utilisateur. */
  weight: z.number(),
  events: z.array(
    z.object({
      delta: z.number().int(),
      reason: TrustEventReasonSchema,
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type TrustSummary = z.infer<typeof TrustSummarySchema>;
