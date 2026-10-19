import type { AdminStopProposal, ReviewStopProposalInput } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { adminApi } from '../api/admin';
import { ErrorText } from '../components/Layout';
import { MAP_COLORS, StopMap } from '../components/StopMap';
import { formatDateTime } from '../lib/format';

/** Arrêts : déplacements confirmés par les passagers, et arrêts proposés. */
export function StopsPage() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['stop-moves'] });
    void queryClient.invalidateQueries({ queryKey: ['stop-proposals'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const moves = useQuery({ queryKey: ['stop-moves'], queryFn: adminApi.stopMoves });
  const proposals = useQuery({ queryKey: ['stop-proposals'], queryFn: adminApi.stopProposals });
  const decideMove = useMutation({
    mutationFn: ({ reportId, apply }: { reportId: string; apply: boolean }) =>
      adminApi.decideStopMove(reportId, apply),
    onSuccess: refresh,
  });

  return (
    <>
      <h1>Arrêts</h1>
      <h2>Déplacements confirmés par les passagers</h2>
      <ErrorText error={moves.error ?? decideMove.error} />
      {moves.data?.length === 0 ? <p className="muted">Aucun déplacement à examiner.</p> : null}
      {moves.data?.map((move) => (
        <div key={move.reportId} className="card">
          <div className="row">
            <strong>{move.stop.nameFr}</strong>
            <span className="muted">
              déplacé de {move.distanceMeters} m · {move.confirmations} confirmation(s) ·{' '}
              {formatDateTime(move.createdAt)}
            </span>
          </div>
          <StopMap
            points={[
              { ...move.stop, label: 'Position actuelle', color: MAP_COLORS.current },
              { ...move.proposed, label: 'Position proposée', color: MAP_COLORS.proposed },
            ]}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="primary"
              onClick={() => decideMove.mutate({ reportId: move.reportId, apply: true })}
            >
              Appliquer la nouvelle position
            </button>
            <button
              type="button"
              onClick={() => decideMove.mutate({ reportId: move.reportId, apply: false })}
            >
              Classer sans suite
            </button>
          </div>
        </div>
      ))}

      <h2>Arrêts proposés</h2>
      <ErrorText error={proposals.error} />
      {proposals.data?.length === 0 ? <p className="muted">Aucune proposition.</p> : null}
      {proposals.data?.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} onDone={refresh} />
      ))}
    </>
  );
}

/** Une proposition : la corriger au besoin (nom arabe, position) puis décider. */
function ProposalCard({ proposal, onDone }: { proposal: AdminStopProposal; onDone: () => void }) {
  const [nameFr, setNameFr] = useState(proposal.nameFr);
  const [nameAr, setNameAr] = useState(proposal.nameAr);
  const [position, setPosition] = useState({
    latitude: proposal.latitude,
    longitude: proposal.longitude,
  });
  const review = useMutation({
    mutationFn: (input: ReviewStopProposalInput) => adminApi.reviewStopProposal(proposal.id, input),
    onSuccess: onDone,
  });

  return (
    <div className="card">
      <div className="row">
        <strong>{proposal.nameFr}</strong>
        <span className="muted">
          par {proposal.proposedBy?.displayName ?? '—'} (score{' '}
          {proposal.proposedBy?.trustScore ?? '—'}) · {formatDateTime(proposal.createdAt)}
        </span>
        {proposal.lines.map((line) => (
          <span key={line.id} className="badge" style={{ borderColor: line.color }}>
            {line.code}
          </span>
        ))}
      </div>
      {proposal.nearestStop ? (
        <p className={proposal.nearestStop.distanceMeters < 80 ? 'error' : 'muted'}>
          Arrêt existant le plus proche : {proposal.nearestStop.nameFr}, à{' '}
          {proposal.nearestStop.distanceMeters} m
          {proposal.nearestStop.distanceMeters < 80 ? ' — doublon possible' : ''}
        </p>
      ) : null}
      <StopMap
        points={[{ ...position, label: 'Arrêt proposé', color: MAP_COLORS.proposed }]}
        onPick={setPosition}
      />
      <p className="muted">Clique sur la carte pour corriger la position.</p>
      <div className="row">
        <label>
          Nom (français)
          <input value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
        </label>
        <label>
          Nom (arabe)
          <input dir="rtl" value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
        </label>
      </div>
      <ErrorText error={review.error} />
      <div className="row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="primary"
          onClick={() => review.mutate({ decision: 'APPROVE', nameFr, nameAr, ...position })}
        >
          Approuver
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => review.mutate({ decision: 'REJECT' })}
        >
          Refuser
        </button>
      </div>
    </div>
  );
}
