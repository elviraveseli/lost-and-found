import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { ClaimCard } from '../components/ClaimCard.jsx';
import { EmptyState, ErrorMessage, ItemCard, Pagination, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';

const TABS = [
  { key: 'reports', label: 'My reports' },
  { key: 'claims', label: 'My claims' },
  { key: 'received', label: 'Claims to review' },
];

export function DashboardPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'reports';

  return (
    <>
      <div className="page-header">
        <h1>Hi, {user.name}</h1>
        <Link to="/items/new" className="btn btn--primary">
          + New report
        </Link>
      </div>
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
      {tab === 'reports' && <MyReports />}
      {tab === 'claims' && <ClaimList endpoint="/claims/mine" empty="You have not claimed any items yet." />}
      {tab === 'received' && (
        <ClaimList endpoint="/claims/received" defaultStatus="pending" empty="No claims on your found reports." />
      )}
    </>
  );
}

function MyReports() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const { data: items, meta, loading, error, reload } = useAsync(
    () => api('/items/mine', { query: { page, status, limit: 12 } }),
    [page, status],
  );

  return (
    <>
      <StatusFilter value={status} onChange={(s) => { setStatus(s); setPage(1); }} options={['all', 'open', 'resolved']} />
      {loading && <Spinner />}
      <ErrorMessage error={error} onRetry={reload} />
      {!loading && items?.length === 0 && (
        <EmptyState title="No reports yet" action={<Link to="/items/new" className="btn btn--primary">Create a report</Link>} />
      )}
      {!loading && items?.length > 0 && (
        <div className="grid">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              footer={
                item.pendingClaims > 0 && (
                  <Link to={`/items/${item.id}/claims`} className="badge badge--attention">
                    {item.pendingClaims} claim{item.pendingClaims > 1 ? 's' : ''} to review
                  </Link>
                )
              }
            />
          ))}
        </div>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}

function ClaimList({ endpoint, empty, defaultStatus = 'all' }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(defaultStatus);
  const { data: claims, meta, loading, error, reload } = useAsync(
    () => api(endpoint, { query: { page, status, limit: 10 } }),
    [endpoint, page, status],
  );

  return (
    <>
      <StatusFilter
        value={status}
        onChange={(s) => { setStatus(s); setPage(1); }}
        options={['all', 'pending', 'accepted', 'rejected', 'withdrawn']}
      />
      {loading && <Spinner />}
      <ErrorMessage error={error} onRetry={reload} />
      {!loading && claims?.length === 0 && <EmptyState title="Nothing here">{empty}</EmptyState>}
      <div className="stack">
        {!loading && claims?.map((claim) => <ClaimCard key={claim.id} claim={claim} onChange={reload} />)}
      </div>
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}

function StatusFilter({ value, onChange, options }) {
  return (
    <div className="chips" role="group" aria-label="Filter by status">
      {options.map((o) => (
        <button key={o} type="button" className={`chip ${value === o ? 'is-active' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
