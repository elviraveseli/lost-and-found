import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Item } from '../src/models/Item.js';
import { User } from '../src/models/User.js';

export const PASSWORD = 'Password123';

// A small wrapper around a supertest agent that behaves like the browser
// client: it keeps cookies and sends the CSRF token header on every request.
export class TestClient {
  constructor(app = createApp()) {
    this.app = app;
    this.agent = request.agent(app);
    this.csrfToken = null;
  }

  async init() {
    const res = await this.agent.get('/api/auth/csrf');
    this.csrfToken = res.body.data.csrfToken;
    return this;
  }

  #capture(res) {
    const cookies = res.headers['set-cookie'] ?? [];
    const csrf = cookies.find((c) => c.startsWith('csrf_token='));
    if (csrf) this.csrfToken = csrf.split(';')[0].split('=')[1];
    return res;
  }

  #send(method, url) {
    const req = this.agent[method](url);
    if (method !== 'get' && this.csrfToken) req.set('X-CSRF-Token', this.csrfToken);
    // Return a thenable so callers can still chain .send()/.field()/.attach().
    const originalThen = req.then.bind(req);
    req.then = (resolve, reject) => originalThen((res) => resolve(this.#capture(res)), reject);
    return req;
  }

  get(url) { return this.#send('get', url); }
  post(url) { return this.#send('post', url); }
  patch(url) { return this.#send('patch', url); }
  delete(url) { return this.#send('delete', url); }
}

let counter = 0;

export async function createUser({ role = 'user', name, email, isActive = true } = {}) {
  counter += 1;
  return User.create({
    name: name ?? `Test User ${counter}`,
    email: email ?? `user${counter}-${Date.now()}@example.test`,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role,
    isActive,
  });
}

// Creates a user directly in the DB and returns a logged-in client.
export async function loggedInClient(options = {}, app) {
  const user = await createUser(options);
  const client = await new TestClient(app).init();
  const res = await client.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed in test helper: ${res.status}`);
  return { client, user };
}

export function validItem(overrides = {}) {
  return {
    type: 'found',
    title: 'Black leather wallet',
    description: 'Black leather wallet with a red stitching found near the bench.',
    category: 'wallets-and-cards',
    date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    location: 'Central Station, platform 4',
    ...overrides,
  };
}

// Insert an item directly (bypasses HTTP, for setting up scenarios quickly).
export function insertItem(owner, overrides = {}) {
  const data = validItem(overrides);
  return Item.create({ ...data, date: new Date(data.date), owner: owner._id });
}

// Smallest valid PNG (1x1 pixel).
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
