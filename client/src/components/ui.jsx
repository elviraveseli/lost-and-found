// Small presentational components shared across pages.
import { Link } from 'react-router';
import { CATEGORIES, CATEGORY_ICONS, formatDate } from '../utils/format.js';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner__circle" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorMessage({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert--error" role="alert">
      <span>{error.message ?? String(error)}</span>
      {onRetry && (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">🔍</div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function TypeBadge({ type }) {
  return <span className={`badge badge--${type}`}>{type === 'lost' ? 'Lost' : 'Found'}</span>;
}

export function StatusBadge({ status }) {
  return <span className={`badge badge--status-${status}`}>{status}</span>;
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className={`field ${error ? 'field--invalid' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <small className="field__hint">{hint}</small>}
      {error && <small className="field__error">{error}</small>}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn--ghost" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        ← Previous
      </button>
      <span className="muted">
        Page {meta.page} of {meta.totalPages}
      </span>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onPage(meta.page + 1)}
      >
        Next →
      </button>
    </nav>
  );
}

export function ItemImage({ item, className = '', lazy = true }) {
  if (item.imageUrl) {
    return (
      <img className={`item-image ${className}`} src={item.imageUrl} alt={item.title} loading={lazy ? 'lazy' : 'eager'} />
    );
  }
  return (
    <div className={`item-image item-image--placeholder ${className}`} aria-hidden="true">
      {CATEGORY_ICONS[item.category] ?? '📦'}
    </div>
  );
}

export function ItemCard({ item, footer }) {
  return (
    <article className="card item-card">
      <Link to={`/items/${item.id}`} className="item-card__link">
        <ItemImage item={item} />
        <div className="item-card__body">
          <div className="item-card__badges">
            <TypeBadge type={item.type} />
            {item.status === 'resolved' && <StatusBadge status="resolved" />}
            {item.removed && <span className="badge badge--danger">removed</span>}
          </div>
          <h3 className="item-card__title">{item.title}</h3>
          <p className="item-card__meta">
            {CATEGORIES[item.category]} · {formatDate(item.date)}
          </p>
          <p className="item-card__meta">📍 {item.location}</p>
        </div>
      </Link>
      {footer && <div className="item-card__footer">{footer}</div>}
    </article>
  );
}
