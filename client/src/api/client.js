// Thin wrapper around fetch that knows the API conventions:
//  - cookies are sent automatically (same origin)
//  - state-changing requests carry the CSRF token header
//  - errors become ApiError instances with the server's code/message/details

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details ?? [];
  }

  // { title: 'Title must be at least 3 characters', ... } for showing next to form fields
  get fieldErrors() {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

function readCookie(name) {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

async function csrfToken({ refresh = false } = {}) {
  let token = refresh ? null : readCookie('csrf_token');
  if (!token) {
    await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    token = readCookie('csrf_token');
  }
  return token;
}

function buildUrl(path, query) {
  if (!query) return `/api${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

export async function api(path, { method = 'GET', body, query, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary header itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (method !== 'GET') headers['X-CSRF-Token'] = await csrfToken();

  let res;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return { data: null };
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    const error = json?.error ?? {};
    // The CSRF cookie may have expired or rotated: fetch a fresh one and retry once.
    if (res.status === 403 && error.code === 'CSRF_INVALID' && retry) {
      await csrfToken({ refresh: true });
      return api(path, { method, body, query, retry: false });
    }
    throw new ApiError(res.status, error.code ?? 'UNKNOWN', error.message ?? `Request failed (${res.status})`, error.details);
  }
  return json; // { success, data, meta? }
}
