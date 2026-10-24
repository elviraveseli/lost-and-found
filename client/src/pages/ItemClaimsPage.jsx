import { Link, useParams } from 'react-router';
import { api } from '../api/client.js';
import { ClaimCard } from '../components/ClaimCard.jsx';
import { EmptyState, ErrorMessage, Spinner, StatusBadge } from '../components/ui.jsx';
import { useAsync } from '../hooks/useAsync.js';

// The report owner reviews every claim on one found report.
export function ItemClaimsPage() {
  const { id } = useParams();
  const item = useAsync(() => api(`/items/${id}`), [id]);
  const claims = useAsync(() => api(`/items/${id}/claims`), [id]);

  const reloadAll = () => {
    item.reload();
    claims.reload();
  };

  if (item.loading || claims.loading) return <Spinner />;
  if (claims.error?.status === 403) {
    return <EmptyState title="Access denied">Only the owner of this report can review its claims.</EmptyState>;
  }
  const error = item.error ?? claims.error;
  if (error) return <ErrorMessage error={error} onRetry={reloadAll} />;

  const pending = claims.data.filter((c) => c.status === 'pending').length;

  return (
    <>
      <Link to={`/items/${id}`} className="back-link">
        ← Back to report
      </Link>
      <div className="page-header">
        <div>
          <h1>Claims for “{item.data.title}”</h1>
          <p className="muted">
            {pending} pending · Report is <StatusBadge status={item.data.status} />
          </p>
        </div>
      </div>
      <div className="callout">
        Compare each claim with details you did not publish. Accepting a claim marks the report as resolved, rejects the
        other pending claims, and shares your email with that person so you can arrange the return.
      </div>
      {claims.data.length === 0 ? (
        <EmptyState title="No claims yet">You will get a notification when someone claims this item.</EmptyState>
      ) : (
        <div className="stack">
          {claims.data.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} onChange={reloadAll} showItem={false} />
          ))}
        </div>
      )}
    </>
  );
}
