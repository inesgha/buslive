import type { VoteValue } from '@buslive/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { voteReport } from '@/api/reports';

/**
 * Confirmer / contredire un signalement. Après le vote, les listes qui
 * l'affichent sont rechargées, ainsi que le score de confiance.
 */
export function useVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, value }: { reportId: string; value: VoteValue }) =>
      voteReport(reportId, value),
    onSuccess: (report) => {
      void queryClient.invalidateQueries({ queryKey: ['lineReports', report.line.id] });
      void queryClient.invalidateQueries({ queryKey: ['stopDepartures'] });
      void queryClient.invalidateQueries({ queryKey: ['myTrust'] });
    },
  });
}
