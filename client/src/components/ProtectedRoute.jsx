import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, Spinner } from './ui.jsx';

// UX only: hides pages the user cannot use. The real protection is on the
// server, which checks the session and role on every request.
export function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && user.role !== role) {
    return <EmptyState title="Access denied">You do not have permission to view this page.</EmptyState>;
  }
  return <Outlet />;
}
