import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { Item } from '../src/models/Item.js';
import { createUser, insertItem, loggedInClient, TestClient, TINY_PNG, validItem } from './helpers.js';

// Sends a report as multipart/form-data, the way the browser form does.
function postItem(client, data, image) {
  const req = client.post('/api/items');
  for (const [key, value] of Object.entries(data)) req.field(key, value);
  if (image) req.attach('image', image.buffer, { filename: image.filename, contentType: image.contentType });
  return req;
}

describe('Items: creation and validation', () => {
  it('creates a report owned by the logged-in user', async () => {
    const { client, user } = await loggedInClient();
    const res = await postItem(client, validItem());

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: 'Black leather wallet', type: 'found', status: 'open', isOwner: true });
    expect(res.body.data.owner).toEqual({ id: user._id.toString(), name: user.name });
    // Contact details are never part of a public report.
    expect(res.body.data.owner.email).toBeUndefined();
  });

  it('requires authentication', async () => {
    const client = await new TestClient().init();
    const res = await postItem(client, validItem());
    expect(res.status).toBe(401);
  });

  it('rejects a client-supplied owner instead of trusting it', async () => {
    const { client } = await loggedInClient();
    const other = await createUser();
    const res = await postItem(client, { ...validItem(), owner: other._id.toString() });
    expect(res.status).toBe(400);
    expect(await Item.countDocuments()).toBe(0);
  });

  it('returns field-level errors for invalid input', async () => {
    const { client } = await loggedInClient();
    const tomorrowPlus = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    const res = await postItem(client, {
      ...validItem(),
      type: 'stolen',
      title: 'x',
      category: 'spaceships',
      date: tomorrowPlus,
    });

    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['type', 'title', 'category', 'date']));
  });

  it('stores a valid image under a random name and serves it', async () => {
    const { client } = await loggedInClient();
    const res = await postItem(client, validItem(), {
      buffer: TINY_PNG,
      filename: '../../my passport.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(201);
    const { imageUrl } = res.body.data;
    expect(imageUrl).toMatch(/^\/api\/uploads\/[a-f0-9]{32}\.png$/);
    // Saved inside the upload directory with the generated name, not the original one.
    const key = imageUrl.split('/').pop();
    await expect(fs.stat(path.join(config.UPLOAD_DIR, key))).resolves.toBeTruthy();

    const image = await request(createApp()).get(imageUrl);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects a file whose content is not really an image', async () => {
    const { client } = await loggedInClient();
    const res = await postItem(client, validItem(), {
      buffer: Buffer.from('<script>alert(1)</script> pretending to be a png'),
      filename: 'evil.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(400);
    expect(await Item.countDocuments()).toBe(0);
  });

  it('rejects disallowed file types', async () => {
    const { client } = await loggedInClient();
    const res = await postItem(client, validItem(), {
      buffer: Buffer.from('MZ fake executable'),
      filename: 'setup.exe',
      contentType: 'application/x-msdownload',
    });
    expect(res.status).toBe(400);
  });

  it('does not serve arbitrary files through the uploads route', async () => {
    const res = await request(createApp()).get('/api/uploads/..%2F..%2Fpackage.json');
    expect(res.status).toBe(404);
  });
});

describe('Items: ownership checks', () => {
  it('lets the owner edit their report', async () => {
    const { client, user } = await loggedInClient();
    const item = await insertItem(user);
    const res = await client.patch(`/api/items/${item._id}`).field('title', 'Brown leather wallet');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Brown leather wallet');
  });

  it('forbids editing or deleting somebody else’s report', async () => {
    const owner = await createUser();
    const item = await insertItem(owner);
    const { client } = await loggedInClient();

    const edit = await client.patch(`/api/items/${item._id}`).field('title', 'Hijacked');
    const del = await client.delete(`/api/items/${item._id}`);
    const resolve = await client.post(`/api/items/${item._id}/resolve`);

    expect(edit.status).toBe(403);
    expect(del.status).toBe(403);
    expect(resolve.status).toBe(403);
    expect((await Item.findById(item._id)).title).toBe('Black leather wallet');
  });

  it('lets the owner delete and resolve their own report', async () => {
    const { client, user } = await loggedInClient();
    const toResolve = await insertItem(user);
    const toDelete = await insertItem(user);

    const resolved = await client.post(`/api/items/${toResolve._id}/resolve`);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('resolved');
    expect((await client.post(`/api/items/${toResolve._id}/resolve`)).status).toBe(409);

    expect((await client.delete(`/api/items/${toDelete._id}`)).status).toBe(204);
    expect(await Item.findById(toDelete._id)).toBeNull();
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    const app = createApp();
    expect((await request(app).get('/api/items/not-an-id')).status).toBe(400);
    expect((await request(app).get('/api/items/64b7f0000000000000000000')).status).toBe(404);
  });
});

describe('Items: browsing, search, filters and pagination', () => {
  it('filters, searches and paginates public reports', async () => {
    const owner = await createUser();
    await insertItem(owner, { title: 'Silver house keys', category: 'keys', type: 'lost', description: 'Three keys on a blue ring.' });
    await insertItem(owner, { title: 'Red umbrella', category: 'other', description: 'Folding umbrella, red with white dots.' });
    for (let i = 0; i < 5; i += 1) await insertItem(owner, { title: `Wallet number ${i}` });
    await insertItem(owner, { title: 'Hidden wallet', removed: true });

    const api = request(createApp());

    const keys = await api.get('/api/items?category=keys');
    expect(keys.body.data).toHaveLength(1);
    expect(keys.body.data[0].title).toBe('Silver house keys');

    const search = await api.get('/api/items?q=umbrella');
    expect(search.body.data.map((i) => i.title)).toEqual(['Red umbrella']);

    const page1 = await api.get('/api/items?type=found&limit=3&page=1');
    const page2 = await api.get('/api/items?type=found&limit=3&page=2');
    expect(page1.body.meta).toMatchObject({ page: 1, limit: 3, total: 6, totalPages: 2 });
    expect(page1.body.data).toHaveLength(3);
    expect(page2.body.data).toHaveLength(3);

    // Removed reports never appear in public listings.
    const all = await api.get('/api/items?limit=50');
    expect(all.body.data.some((i) => i.title === 'Hidden wallet')).toBe(false);
  });

  it('treats regex characters in the location filter literally', async () => {
    const owner = await createUser();
    await insertItem(owner, { location: 'Library' });
    const res = await request(createApp()).get('/api/items?location=.*');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('ignores NoSQL operator injection in query parameters', async () => {
    const owner = await createUser();
    await insertItem(owner, { title: 'Open wallet' });
    await insertItem(owner, { title: 'Resolved wallet', status: 'resolved' });

    // Express 5's default query parser does not build nested objects, so
    // "status[$ne]" arrives as a plain key that the validator strips. The
    // default filter (status=open) still applies.
    const res = await request(createApp()).get('/api/items?status[$ne]=open&type[$ne]=found');
    expect(res.status).toBe(200);
    expect(res.body.data.map((i) => i.title)).toEqual(['Open wallet']);
  });

  it('rejects invalid pagination values', async () => {
    const res = await request(createApp()).get('/api/items?limit=1000&page=0');
    expect(res.status).toBe(400);
  });

  it('shows users their own reports in /mine, including resolved ones', async () => {
    const { client, user } = await loggedInClient();
    await insertItem(user);
    await insertItem(user, { status: 'resolved' });
    await insertItem(await createUser());

    const res = await client.get('/api/items/mine');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((i) => i.isOwner)).toBe(true);
  });
});
