import { z } from 'zod';

/**
 * Réponse de GET /api/v1/health (« liveness ») : le processus de l'API répond.
 * Partagée pour que l'admin puisse afficher l'état de l'API en phase 10.
 */
export const LivenessResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('buslive-api'),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});

export type LivenessResponse = z.infer<typeof LivenessResponseSchema>;
