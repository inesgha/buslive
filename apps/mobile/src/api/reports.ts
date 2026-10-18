import {
  type CreateReportInput,
  type LineStats,
  LineStatsSchema,
  type Report,
  ReportSchema,
  type TrustSummary,
  TrustSummarySchema,
  type VoteValue,
} from '@buslive/shared';
import { z } from 'zod';

import { session } from '@/auth/session';

import { apiRequest } from './client';

export function createReport(input: CreateReportInput): Promise<Report> {
  return apiRequest('/reports', { method: 'POST', body: input, auth: true, schema: ReportSchema });
}

export function voteReport(reportId: string, value: VoteValue): Promise<Report> {
  return apiRequest(`/reports/${reportId}/votes`, {
    method: 'POST',
    body: { value },
    auth: true,
    schema: ReportSchema,
  });
}

/**
 * Signalements d'une ligne. Route publique : si l'utilisateur est connecté, on
 * envoie son jeton pour savoir s'il a déjà voté (« mine », « myVote »).
 */
export function fetchLineReports(lineId: string): Promise<Report[]> {
  return apiRequest(`/lines/${lineId}/reports`, {
    schema: z.array(ReportSchema),
    auth: session.getAccessToken() !== null,
  });
}

export function fetchLineStats(lineId: string): Promise<LineStats> {
  return apiRequest(`/lines/${lineId}/stats`, { schema: LineStatsSchema });
}

export function fetchMyTrust(): Promise<TrustSummary> {
  return apiRequest('/me/trust', { auth: true, schema: TrustSummarySchema });
}
