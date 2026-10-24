import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';

export function Layout() {
  const { user, logout, unread } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const close = () => setMenuOpen(false);

  async function handleLogout() {
    close();
    await logout();
    navigate('/');
  }

  return (
    <div className="app">
      <header className="header">
        <div className="container header__inner">
          <Link to="/" className="brand" onClick={close}>
            <span aria-hidden="true">🔎</span> Lost &amp; Found
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? '✕' : '☰'}
            <span className="sr-only">Menu</span>
          </button>
          <nav id="main-nav" className={`nav ${menuOpen ? 'nav--open' : ''}`} onClick={close}>
            <NavLink to="/" end>
              Browse
            </NavLink>
            {user ? (
              <>
                <NavLink to="/items/new">Report item</NavLink>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/notifications" className="nav__notifications">
                  Notifications
                  {unread > 0 && (
                    <span className="nav__count" aria-label={`${unread} unread`}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </NavLink>
                {user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
                <button type="button" className="btn btn--ghost btn--small" onClick={handleLogout}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login">Log in</NavLink>
                <Link to="/register" className="btn btn--primary btn--small">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="container main">
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container muted">
          Lost &amp; Found · A portfolio project · Match suggestions are potential matches, never confirmed ones.
        </div>
      </footer>
    </div>
  );
}
