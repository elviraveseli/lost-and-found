import { Link, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { EmptyState } from './components/ui.jsx';
import { AdminPage } from './pages/AdminPage.jsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { ItemClaimsPage } from './pages/ItemClaimsPage.jsx';
import { ItemDetailPage } from './pages/ItemDetailPage.jsx';
import { ItemFormPage } from './pages/ItemFormPage.jsx';
import { NotificationsPage } from './pages/NotificationsPage.jsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="items/new" element={<ItemFormPage />} />
          <Route path="items/:id/edit" element={<ItemFormPage />} />
          <Route path="items/:id/claims" element={<ItemClaimsPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>

        <Route element={<ProtectedRoute role="admin" />}>
          <Route path="admin" element={<AdminPage />} />
        </Route>

        <Route
          path="*"
          element={
            <EmptyState title="Page not found" action={<Link to="/">Go to the home page</Link>}>
              The page you are looking for does not exist.
            </EmptyState>
          }
        />
      </Route>
    </Routes>
  );
}
