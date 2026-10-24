import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../api/client.js';
import { EmptyState, ErrorMessage, Field, ItemImage, Spinner, StatusBadge, TypeBadge } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { CATEGORIES, formatDate } from '../utils/format.js';

export function ItemDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: item, loading, error, reload } = useAsync(() => api(`/items/${id}`), [id, user?.id]);

  if (loading) return <Spinner />;
  if (error?.status === 404) {
    return (
      <EmptyState title="Report not found" action={<Link to="/">Back to all reports</Link>}>
        It may have been deleted or removed by a moderator.
      </EmptyState>
    );
  }
  if (error) return <ErrorMessage error={error} onRetry={reload} />;

  const canClaim = user && !item.isOwner && item.type === 'found' && item.status === 'open';

  return (
    <div className="detail">
      <Link to="/" className="back-link">
        ← All reports
      </Link>

      {item.removed && (
        <div className="alert alert--error">
          This report was removed by a moderator and is hidden from other users.
          {item.removedReason && <> Reason: {item.removedReason}</>}
        </div>
      )}

      <div className="detail__layout">
        <ItemImage item={item} className="detail__image" lazy={false} />
        <div className="detail__info card">
          <div className="item-card__badges">
            <TypeBadge type={item.type} />
            <StatusBadge status={item.status} />
          </div>
          <h1>{item.title}</h1>
          <dl className="facts">
            <dt>Category</dt>
            <dd>{CATEGORIES[item.category]}</dd>
            <dt>{item.type === 'lost' ? 'Lost on' : 'Found on'}</dt>
            <dd>{formatDate(item.date)}</dd>
            <dt>Location</dt>
            <dd>{item.location}</dd>
            <dt>Reported by</dt>
            <dd>{item.isOwner ? 'You' : item.owner.name}</dd>
          </dl>
          <p className="detail__description">{item.description}</p>

          {item.isOwner && <OwnerActions item={item} onChange={reload} />}
          {canClaim && <ClaimForm item={item} />}
          {!user && item.type === 'found' && item.status === 'open' && <LoginToClaim />}
          {item.type === 'lost' && !item.isOwner && item.status === 'open' && (
            <p className="muted">
              Found this item? <Link to="/items/new?type=found">Create a found report</Link> and the owner will see it
              as a potential match.
            </p>
          )}
          {user && !item.isOwner && !item.removed && <FlagForm item={item} />}
        </div>
      </div>

      {item.isOwner && item.status === 'open' && !item.removed && <Matches item={item} />}
    </div>
  );
}

function LoginToClaim() {
  const location = useLocation();
  return (
    <div className="callout">
      Is this yours?{' '}
      <Link to="/login" state={{ from: location }}>
        Log in to submit a claim
      </Link>
      .
    </div>
  );
}

function OwnerActions({ item, onChange }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const resolve = () =>
    run(async () => {
      if (!window.confirm('Mark this report as resolved? Any pending claims will be closed.')) return;
      await api(`/items/${item.id}/resolve`, { method: 'POST' });
      onChange();
    });

  const remove = () =>
    run(async () => {
      if (!window.confirm('Delete this report permanently? This cannot be undone.')) return;
      await api(`/items/${item.id}`, { method: 'DELETE' });
      navigate('/dashboard');
    });

  return (
    <div className="actions">
      {!item.removed && (
        <Link to={`/items/${item.id}/edit`} className="btn btn--secondary">
          Edit
        </Link>
      )}
      {item.type === 'found' && (
        <Link to={`/items/${item.id}/claims`} className="btn btn--secondary">
          Review claims
        </Link>
      )}
      {item.status === 'open' && !item.removed && (
        <button type="button" className="btn btn--secondary" onClick={resolve} disabled={busy}>
          Mark as resolved
        </button>
      )}
      <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
        Delete
      </button>
      <ErrorMessage error={error} />
    </div>
  );
}

function ClaimForm({ item }) {
  const [message, setMessage] = useState('');
  const [state, setState] = useState({ submitting: false, error: null, done: false });
  const tooShort = message.trim().length < 20;

  async function onSubmit(e) {
    e.preventDefault();
    setState({ submitting: true, error: null, done: false });
    try {
      await api(`/items/${item.id}/claims`, { method: 'POST', body: { message: message.trim() } });
      setState({ submitting: false, error: null, done: true });
    } catch (error) {
      setState({ submitting: false, error, done: false });
    }
  }

  if (state.done) {
    return (
      <div className="alert alert--success">
        Claim submitted. The finder will review it and you will get a notification.{' '}
        <Link to="/dashboard?tab=claims">Track your claims</Link>
      </div>
    );
  }

  return (
    <form className="claim-form" onSubmit={onSubmit}>
      <h2>Is this yours?</h2>
      <Field
        label="Describe the item"
        htmlFor="claim-message"
        error={state.error?.fieldErrors?.message}
        hint="Mention details only the owner would know (contents, marks, serial numbers). Only the finder can read this."
      >
        <textarea
          id="claim-message"
          rows={4}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      {state.error && state.error.code !== 'VALIDATION_ERROR' && <ErrorMessage error={state.error} />}
      <button type="submit" className="btn btn--primary" disabled={state.submitting || tooShort}>
        {state.submitting ? 'Submitting…' : 'Submit claim'}
      </button>
      {tooShort && message.length > 0 && <small className="muted"> At least 20 characters.</small>}
    </form>
  );
}

function FlagForm({ item }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ error: null, done: false });

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await api(`/items/${item.id}/flag`, { method: 'POST', body: { reason: reason.trim() } });
      setState({ error: null, done: true });
    } catch (error) {
      setState({ error, done: false });
    }
  }

  if (state.done) return <p className="muted">Thanks, a moderator will review this report.</p>;
  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        Report this listing
      </button>
    );
  }
  return (
    <form className="inline-form" onSubmit={onSubmit}>
      <input
        aria-label="Reason for reporting"
        placeholder="Why is this inappropriate?"
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
      />
      <button type="submit" className="btn btn--small btn--danger" disabled={reason.trim().length < 5}>
        Send
      </button>
      <button type="button" className="btn btn--small btn--ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
      <ErrorMessage error={state.error} />
    </form>
  );
}

function Matches({ item }) {
  const { data: matches, loading, error, reload } = useAsync(() => api(`/items/${item.id}/matches`), [item.id]);
  return (
    <section className="matches">
      <h2>Potential matches</h2>
      <p className="muted">
        Reports of {item.type === 'lost' ? 'found' : 'lost'} items that look similar to yours. These are suggestions
        based on category, keywords, date and location — not confirmed matches.
      </p>
      {loading && <Spinner label="Looking for matches…" />}
      <ErrorMessage error={error} onRetry={reload} />
      {matches?.length === 0 && <p className="muted">No potential matches yet. We will notify you if one appears.</p>}
      <div className="match-list">
        {matches?.map((m) => (
          <article key={m.item.id} className="card match">
            <div className="match__score" title="Similarity score out of 100">
              <strong>{m.score}</strong>
              <small>/100</small>
            </div>
            <div>
              <Link to={`/items/${m.item.id}`}>
                <h3>{m.item.title}</h3>
              </Link>
              <p className="muted">
                {formatDate(m.item.date)} · {m.item.location}
              </p>
              <ul className="match__reasons">
                {m.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
