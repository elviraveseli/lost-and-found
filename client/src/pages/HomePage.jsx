import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api/client.js';
import { EmptyState, ErrorMessage, ItemCard, Pagination, Spinner } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { CATEGORIES } from '../utils/format.js';

const FILTER_KEYS = ['q', 'type', 'category', 'status', 'sort', 'page'];

export function HomePage() {
  const { user } = useAuth();
  // Filters live in the URL so searches can be shared and the back button works.
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? '']));
  const [search, setSearch] = useState(filters.q);

  useEffect(() => setSearch(filters.q), [filters.q]);

  const { data: items, meta, loading, error, reload } = useAsync(
    () => api('/items', { query: { ...filters, limit: 12 } }),
    [params.toString()],
  );

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page'); // new filters start at page 1
    setParams(next);
  }

  function onSubmit(e) {
    e.preventDefault();
    update({ q: search.trim() });
  }

  const hasFilters = FILTER_KEYS.some((k) => k !== 'page' && filters[k]);

  return (
    <>
      <section className="hero">
        <h1>Lost something? Found something?</h1>
        <p className="muted">
          Search reports from your community, or create one. We suggest potential matches between lost and found
          items automatically.
        </p>
        <div className="hero__actions">
          <Link to={user ? '/items/new?type=lost' : '/register'} className="btn btn--primary">
            I lost something
          </Link>
          <Link to={user ? '/items/new?type=found' : '/register'} className="btn btn--secondary">
            I found something
          </Link>
        </div>
      </section>

      <form className="filters card" onSubmit={onSubmit} role="search">
        <input
          type="search"
          className="filters__search"
          placeholder="Search e.g. black wallet, keys, station…"
          aria-label="Search reports"
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Type" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
          <option value="">Lost &amp; found</option>
          <option value="lost">Lost</option>
          <option value="found">Found</option>
        </select>
        <select aria-label="Category" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All categories</option>
          {Object.entries(CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Open</option>
          <option value="resolved">Resolved</option>
          <option value="all">Any status</option>
        </select>
        <select aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="">Newest reports</option>
          <option value="date">Most recent date lost/found</option>
          <option value="oldest">Oldest reports</option>
        </select>
        <button type="submit" className="btn btn--primary">
          Search
        </button>
      </form>

      {loading && <Spinner label="Loading reports…" />}
      <ErrorMessage error={error} onRetry={reload} />

      {!loading && !error && items?.length === 0 && (
        <EmptyState
          title="No reports found"
          action={
            hasFilters ? (
              <button type="button" className="btn btn--ghost" onClick={() => setParams({})}>
                Clear filters
              </button>
            ) : (
              user && (
                <Link to="/items/new" className="btn btn--primary">
                  Create the first report
                </Link>
              )
            )
          }
        >
          {hasFilters ? 'Try different keywords or remove some filters.' : 'Nothing has been reported yet.'}
        </EmptyState>
      )}

      {!loading && items?.length > 0 && (
        <>
          <p className="muted results-count">
            {meta.total} report{meta.total === 1 ? '' : 's'}
          </p>
          <div className="grid">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
          <Pagination meta={meta} onPage={(page) => update({ page: String(page) })} />
        </>
      )}
    </>
  );
}
