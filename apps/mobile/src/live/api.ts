import {
  type LineVehicles,
  LineVehiclesSchema,
  type LiveSession,
  LiveSessionSchema,
  type PositionBatchResult,
  PositionBatchResultSchema,
  type PositionSample,
  type StartLiveSessionInput,
} from '@buslive/shared';

import { apiRequest } from '@/api/client';

export function startLiveSession(input: StartLiveSessionInput): Promise<LiveSession> {
  return apiRequest('/live/sessions', {
    method: 'POST',
    body: input,
    auth: true,
    schema: LiveSessionSchema,
  });
}

export function sendPositions(
  sessionId: string,
  points: PositionSample[],
): Promise<PositionBatchResult> {
  return apiRequest(`/live/sessions/${sessionId}/positions`, {
    method: 'POST',
    body: { points },
    auth: true,
    schema: PositionBatchResultSchema,
  });
}

export function endLiveSession(sessionId: string): Promise<LiveSession> {
  return apiRequest(`/live/sessions/${sessionId}`, {
    method: 'DELETE',
    auth: true,
    schema: LiveSessionSchema,
  });
}

export function fetchLineVehicles(lineId: string): Promise<LineVehicles> {
  return apiRequest(`/live/lines/${lineId}/vehicles`, { schema: LineVehiclesSchema });
}
