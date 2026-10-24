import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client.js';
import { EmptyState, ErrorMessage, Pagination, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { timeAgo } from '../utils/format.js';

const ICONS = {
  claim_received: '📨',
  claim_accepted: '✅',
  claim_rejected: '❌',
  potential_match: '🔗',
  report_removed: '⚠️',
};

export function NotificationsPage() {
  const { refreshUnread } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const { data, meta, loading, error: loadError, reload } = useAsync(
    () => api('/notifications', { query: { page, limit: 20 } }),
    [page],
  );

  async function open(n) {
    try {
      if (!n.read) {
        await api(`/notifications/${n.id}/read`, { method: 'POST' });
        refreshUnread();
      }
      if (n.link) navigate(n.link);
      else reload();
    } catch (err) {
      setError(err);
    }
  }

  async function markAll() {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      refreshUnread();
      reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Notifications</h1>
        {meta?.unread > 0 && (
          <button type="button" className="btn btn--ghost" onClick={markAll}>
            Mark all as read
          </button>
        )}
      </div>
      {loading && <Spinner />}
      <ErrorMessage error={loadError ?? error} onRetry={reload} />
      {!loading && data?.length === 0 && (
        <EmptyState title="No notifications">
          You will be notified about new claims, claim decisions and potential matches.
        </EmptyState>
      )}
      <ul className="notifications">
        {!loading &&
          data?.map((n) => (
            <li key={n.id}>
              <button type="button" className={`notification ${n.read ? '' : 'notification--unread'}`} onClick={() => open(n)}>
                <span className="notification__icon" aria-hidden="true">
                  {ICONS[n.type] ?? '🔔'}
                </span>
                <span className="notification__text">
                  <strong>{n.title}</strong>
                  {n.body && <span className="muted">{n.body}</span>}
                </span>
                <time className="muted" dateTime={n.createdAt}>
                  {timeAgo(n.createdAt)}
                </time>
              </button>
            </li>
          ))}
      </ul>
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}
