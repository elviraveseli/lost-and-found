import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client.js';
import { formatDateTime } from '../utils/format.js';
import { ErrorMessage, StatusBadge } from './ui.jsx';

// Shows one claim. What is visible depends on who is looking:
//  - the report owner sees the claimant's message and can accept/reject
//  - the claimant sees the decision and, once accepted, the finder's contact
export function ClaimCard({ claim, onChange, showItem = true }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isOwnerView = claim.viewerRole === 'owner';
  const pending = claim.status === 'pending';

  async function act(path, body, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/claims/${claim.id}/${path}`, { method: 'POST', body });
      onChange?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card claim">
      <header className="claim__header">
        <div>
          {showItem && (
            <Link to={`/items/${claim.item.id}`} className="claim__item">
              {claim.item.title ?? 'Report'}
            </Link>
          )}
          <div className="muted">
            {isOwnerView ? `Claim by ${claim.claimant.name}` : 'Your claim'} · {formatDateTime(claim.createdAt)}
          </div>
        </div>
        <StatusBadge status={claim.status} />
      </header>

      <blockquote className="claim__message">{claim.message}</blockquote>

      {claim.decisionNote && (
        <p>
          <strong>Note:</strong> {claim.decisionNote}
        </p>
      )}

      {claim.status === 'accepted' && isOwnerView && claim.claimant.email && (
        <div className="alert alert--success">
          You accepted this claim. Contact {claim.claimant.name} at{' '}
          <a href={`mailto:${claim.claimant.email}`}>{claim.claimant.email}</a> to arrange the return.
        </div>
      )}
      {claim.status === 'accepted' && claim.ownerContact && (
        <div className="alert alert--success">
          Accepted! Contact {claim.ownerContact.name} at{' '}
          <a href={`mailto:${claim.ownerContact.email}`}>{claim.ownerContact.email}</a> to arrange the return. Meet in a
          public place.
        </div>
      )}

      {pending && isOwnerView && (
        <div className="claim__decision">
          <input
            aria-label="Optional note to the claimant"
            placeholder="Optional note (e.g. where to meet, or why you rejected)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() =>
                act(
                  'decision',
                  { decision: 'accepted', note: note.trim() || undefined },
                  'Accept this claim? The report will be marked as resolved, other pending claims will be rejected, and your email will be shared with this person.',
                )
              }
            >
              Accept
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => act('decision', { decision: 'rejected', note: note.trim() || undefined })}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {pending && claim.viewerRole === 'claimant' && (
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={busy}
          onClick={() => act('withdraw', undefined, 'Withdraw this claim?')}
        >
          Withdraw claim
        </button>
      )}
      <ErrorMessage error={error} />
    </article>
  );
}
