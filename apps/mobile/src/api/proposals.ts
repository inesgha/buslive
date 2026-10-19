import { type StopProposal, type StopProposalInput, StopProposalSchema } from '@buslive/shared';
import { z } from 'zod';

import { apiRequest } from './client';

/** Proposer un arrêt manquant : invisible pour les autres tant qu'un modérateur ne l'a pas approuvé. */
export function proposeStop(input: StopProposalInput): Promise<StopProposal> {
  return apiRequest('/stops/proposals', {
    method: 'POST',
    body: input,
    auth: true,
    schema: StopProposalSchema,
  });
}

export function fetchMyStopProposals(): Promise<StopProposal[]> {
  return apiRequest('/me/stop-proposals', { auth: true, schema: z.array(StopProposalSchema) });
}
