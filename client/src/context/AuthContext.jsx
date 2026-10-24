import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);
const POLL_MS = 30_000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  // On page load, ask the server who we are. The session lives in an HTTP-only
  // cookie, so JavaScript cannot read it directly - this is the only way to know.
  useEffect(() => {
    api('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await api('/notifications/unread-count');
      setUnread(res.data.unread);
    } catch {
      // Not critical: keep the old badge value.
    }
  }, []);

  // Simple polling keeps the notification badge fresh without WebSockets.
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return undefined;
    }
    refreshUnread();
    const timer = setInterval(refreshUnread, POLL_MS);
    return () => clearInterval(timer);
  }, [user, refreshUnread]);

  const login = useCallback(async (credentials) => {
    const res = await api('/auth/login', { method: 'POST', body: credentials });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (data) => {
    const res = await api('/auth/register', { method: 'POST', body: data });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, unread, refreshUnread }),
    [user, loading, login, register, logout, unread, refreshUnread],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
