import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ErrorMessage, Field } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Client-side checks give instant feedback; the server validates again and is
// the source of truth.
function validateRegister({ name, email, password, confirm }) {
  const errors = {};
  if (name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must contain a letter and a number';
  }
  if (confirm !== password) errors.confirm = 'Passwords do not match';
  return errors;
}

function useRedirectTarget() {
  const location = useLocation();
  return location.state?.from?.pathname ?? '/dashboard';
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={target} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(target, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth card">
      <h1>Log in</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <ErrorMessage error={error} />
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting || !form.email || !form.password}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="muted">
        No account yet? <Link to="/register">Create one</Link>
      </p>
    </div>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    const clientErrors = validateRegister(form);
    setErrors(clientErrors);
    setError(null);
    if (Object.keys(clientErrors).length) return;

    setSubmitting(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrors(err.fieldErrors ?? {});
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth card">
      <h1>Create an account</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Name" htmlFor="name" error={errors.name}>
          <input id="name" autoComplete="name" value={form.name} onChange={set('name')} maxLength={60} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email} hint="Only shared with someone after you accept their claim.">
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
            maxLength={128}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm}>
          <input id="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </Field>
        {error && error.code !== 'VALIDATION_ERROR' && <ErrorMessage error={error} />}
        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
