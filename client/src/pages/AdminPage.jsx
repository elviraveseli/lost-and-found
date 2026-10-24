import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { EmptyState, ErrorMessage, Pagination, Spinner, StatusBadge, TypeBadge } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { formatDate } from '../utils/format.js';

const TABS = [
  { key: 'flagged', label: 'Flagged' },
  { key: 'all', label: 'All reports' },
  { key: 'removed', label: 'Removed' },
  { key: 'users', label: 'Users' },
];

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'flagged';
  const stats = useAsync(() => api('/admin/stats'), [tab]);

  return (
    <>
      <h1>Administration</h1>
      {stats.data && (
        <div className="stats">
          <Stat label="Users" value={stats.data.users} />
          <Stat label="Open reports" value={stats.data.openItems} />
          <Stat label="Resolved" value={stats.data.resolvedItems} />
          <Stat label="Flagged" value={stats.data.flagged} highlight={stats.data.flagged > 0} />
          <Stat label="Removed" value={stats.data.removed} />
        </div>
      )}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'is-active' : ''}
            onClick={() => setParams({ tab: t.key })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'users' ? <UsersTable /> : <ReportsTable view={tab} onChange={stats.reload} />}
    </>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`card stat ${highlight ? 'stat--highlight' : ''}`}>
      <strong>{value}</strong>
      <span className="muted">{label}</span>
    </div>
  );
}

function ReportsTable({ view, onChange }) {
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const { data: items, meta, loading, error: loadError, reload } = useAsync(
    () => api('/admin/items', { query: { view, page, limit: 20 } }),
    [view, page],
  );

  async function act(fn) {
    setError(null);
    try {
      await fn();
      reload();
      onChange();
    } catch (err) {
      setError(err);
    }
  }

  const remove = (item) => {
    const reason = window.prompt(`Why are you removing “${item.title}”? The owner will see this reason.`);
    if (!reason || reason.trim().length < 3) return;
    act(() => api(`/admin/items/${item.id}/remove`, { method: 'POST', body: { reason: reason.trim() } }));
  };
  const restore = (item) => act(() => api(`/admin/items/${item.id}/restore`, { method: 'POST' }));
  const dismiss = (item) => act(() => api(`/admin/items/${item.id}/dismiss-flags`, { method: 'POST' }));

  if (loading) return <Spinner />;
  return (
    <>
      <ErrorMessage error={loadError ?? error} onRetry={reload} />
      {items?.length === 0 && <EmptyState title="Nothing to review" />}
      <div className="stack">
        {items?.map((item) => (
          <article key={item.id} className="card admin-row">
            <div className="admin-row__main">
              <div className="item-card__badges">
                <TypeBadge type={item.type} />
                <StatusBadge status={item.status} />
                {item.removed && <span className="badge badge--danger">removed</span>}
                {item.flagCount > 0 && <span className="badge badge--attention">{item.flagCount} flag(s)</span>}
              </div>
              <Link to={`/items/${item.id}`}>
                <strong>{item.title}</strong>
              </Link>
              <div className="muted">
                by {item.owner.name} · {formatDate(item.createdAt)}
              </div>
              {item.flags?.length > 0 && (
                <ul className="flag-list">
                  {item.flags.map((f, i) => (
                    <li key={i}>“{f.reason}”</li>
                  ))}
                </ul>
              )}
              {item.removedReason && <div className="muted">Removed: {item.removedReason}</div>}
            </div>
            <div className="actions">
              {!item.removed && (
                <button type="button" className="btn btn--danger btn--small" onClick={() => remove(item)}>
                  Remove
                </button>
              )}
              {item.removed && (
                <button type="button" className="btn btn--secondary btn--small" onClick={() => restore(item)}>
                  Restore
                </button>
              )}
              {!item.removed && item.flagCount > 0 && (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => dismiss(item)}>
                  Dismiss flags
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}

function UsersTable() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const { data: users, meta, loading, error: loadError, reload } = useAsync(
    () => api('/admin/users', { query: { q: search, page, limit: 20 } }),
    [search, page],
  );

  async function toggle(user) {
    setError(null);
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body: { isActive: !user.isActive } });
      reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <input type="search" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <button type="submit" className="btn btn--secondary btn--small">
          Search
        </button>
      </form>
      {loading && <Spinner />}
      <ErrorMessage error={loadError ?? error} onRetry={reload} />
      {!loading && users?.length === 0 && <EmptyState title="No users found" />}
      {!loading && users?.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{u.isActive ? 'Active' : 'Deactivated'}</td>
                  <td>
                    {u.id !== me.id && (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => toggle(u)}>
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}
