import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { createUser, loggedInClient, PASSWORD, TestClient } from './helpers.js';

const newUser = { name: 'Alice Example', email: 'Alice@Example.test', password: 'Secret123' };

describe('Auth: registration', () => {
  it('registers a user, hashes the password and sets an HTTP-only cookie', async () => {
    const client = await new TestClient().init();
    const res = await client.post('/api/auth/register').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ name: 'Alice Example', email: 'alice@example.test', role: 'user' });
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const authCookie = res.headers['set-cookie'].find((c) => c.startsWith('token='));
    expect(authCookie).toMatch(/HttpOnly/);
    expect(authCookie).toMatch(/SameSite=Lax/);

    const stored = await User.findOne({ email: 'alice@example.test' }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe(newUser.password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('ignores attempts to self-assign the admin role', async () => {
    const client = await new TestClient().init();
    const res = await client.post('/api/auth/register').send({ ...newUser, role: 'admin' });
    // Strict validation rejects unknown fields instead of silently trusting them.
    expect(res.status).toBe(400);
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects an invalid email and a weak password with field details', async () => {
    const client = await new TestClient().init();
    const res = await client.post('/api/auth/register').send({ name: 'Bob', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rejects a duplicate email with 409', async () => {
    const client = await new TestClient().init();
    await client.post('/api/auth/register').send(newUser);
    const again = await (await new TestClient().init()).post('/api/auth/register').send(newUser);
    expect(again.status).toBe(409);
  });
});

describe('Auth: login, session and logout', () => {
  it('logs in with valid credentials and returns the current user from /me', async () => {
    const { client, user } = await loggedInClient();
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
  });

  it('uses the same generic error for unknown email and wrong password', async () => {
    const user = await createUser();
    const client = await new TestClient().init();

    const wrongPassword = await client.post('/api/auth/login').send({ email: user.email, password: 'Wrong1234' });
    const unknownEmail = await client.post('/api/auth/login').send({ email: 'nobody@example.test', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('does not let deactivated users log in', async () => {
    const user = await createUser({ isActive: false });
    const client = await new TestClient().init();
    const res = await client.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('logs out by clearing the session cookie', async () => {
    const { client } = await loggedInClient();
    const res = await client.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect((await client.get('/api/auth/me')).status).toBe(401);
  });

  it('rate-limits repeated login attempts', async () => {
    const client = await new TestClient(createApp({ loginRateLimit: 3 })).init();
    const attempt = () => client.post('/api/auth/login').send({ email: 'x@example.test', password: 'Wrong1234' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('Auth: unauthorized requests and CSRF', () => {
  it('returns 401 for protected routes without a session', async () => {
    const res = await request(createApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  });

  it('returns 401 for a tampered token', async () => {
    const res = await request(createApp()).get('/api/auth/me').set('Cookie', 'token=not.a.realtoken');
    expect(res.status).toBe(401);
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const res = await request(createApp()).post('/api/auth/login').send({ email: 'a@example.test', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects a CSRF header that does not match the cookie', async () => {
    const client = await new TestClient().init();
    const res = await client.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', 'forged-token')
      .send({ email: 'a@example.test', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await request(createApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' });
  });
});
