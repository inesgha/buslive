import { type LineSummary, LineSummarySchema } from '@buslive/shared';
import { z } from 'zod';

import { apiRequest } from './client';

/** Lignes actives (tous les gouvernorats ouverts). */
export function fetchLines(): Promise<LineSummary[]> {
  return apiRequest('/lines', { schema: z.array(LineSummarySchema) });
}
