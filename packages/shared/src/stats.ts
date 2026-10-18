import { z } from 'zod';

/**
 * Statistiques d'une ligne, calculées à partir des passages réellement
 * observés (bus en direct) et des signalements confirmés.
 */
export const STATS_RULES = {
  /** Période couverte (jours). */
  periodDays: 30,
  /** Un passage est « à l'heure » à ± cette tolérance (minutes). */
  onTimeToleranceMinutes: 3,
  /** En dessous de ce nombre de passages observés, pas de pourcentage (trompeur). */
  minObservations: 10,
} as const;

export const LineStatsSchema = z.object({
  lineId: z.uuid(),
  periodDays: z.number().int().positive(),
  /** Passages observés rapprochés d'un horaire. */
  observedPassages: z.number().int().nonnegative(),
  /** Part des passages à l'heure (0 → 1), null si pas assez de données. */
  onTimeRate: z.number().min(0).max(1).nullable(),
  /** Retard moyen (minutes, négatif = en avance), null si pas assez de données. */
  averageDelayMinutes: z.number().nullable(),
  /** Signalements « pas venu » confirmés sur la période. */
  notCameConfirmed: z.number().int().nonnegative(),
  /** Assez de passages observés pour afficher des pourcentages ? */
  enoughData: z.boolean(),
});
export type LineStats = z.infer<typeof LineStatsSchema>;

/** Calcule les statistiques à partir des retards observés (minutes). */
export function computeLineStats(
  delays: readonly number[],
): Pick<LineStats, 'observedPassages' | 'onTimeRate' | 'averageDelayMinutes' | 'enoughData'> {
  const observedPassages = delays.length;
  const enoughData = observedPassages >= STATS_RULES.minObservations;
  if (!enoughData) {
    return { observedPassages, onTimeRate: null, averageDelayMinutes: null, enoughData };
  }
  const onTime = delays.filter((d) => Math.abs(d) <= STATS_RULES.onTimeToleranceMinutes).length;
  const average = delays.reduce((sum, d) => sum + d, 0) / observedPassages;
  return {
    observedPassages,
    onTimeRate: Math.round((onTime / observedPassages) * 100) / 100,
    averageDelayMinutes: Math.round(average * 10) / 10,
    enoughData,
  };
}
