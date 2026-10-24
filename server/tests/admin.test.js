import { beforeEach, describe, expect, it } from 'vitest';
import { Claim } from '../src/models/Claim.js';
import { Item } from '../src/models/Item.js';
import { User } from '../src/models/User.js';
import { createUser, insertItem, loggedInClient, TestClient } from './helpers.js';

const ADMIN_ENDPOINTS = [
  ['get', '/api/admin/stats'],
  ['get', '/api/admin/users'],
  ['get', '/api/admin/items'],
  ['patch', '/api/admin/users/64b7f0000000000000000000'],
  ['post', '/api/admin/items/64b7f0000000000000000000/remove'],
  ['post', '/api/admin/items/64b7f0000000000000000000/restore'],
  ['post', '/api/admin/items/64b7f0000000000000000000/dismiss-flags'],
];

describe('Admin permissions', () => {
  it.each(ADMIN_ENDPOINTS)('%s %s returns 401 without a session', async (method, url) => {
    const client = await new TestClient().init();
    expect((await client[method](url)).status).toBe(401);
  });

  it.each(ADMIN_ENDPOINTS)('%s %s returns 403 for a normal user', async (method, url) => {
    const { client } = await loggedInClient({ role: 'user' });
    expect((await client[method](url)).status).toBe(403);
  });

  it('loses admin access immediately when the role is removed in the database', async () => {
    const { client, user } = await loggedInClient({ role: 'admin' });
    expect((await client.get('/api/admin/stats')).status).toBe(200);
    await User.updateOne({ _id: user._id }, { role: 'user' });
    // Same cookie/JWT, but the role is re-read from the DB on every request.
    expect((await client.get('/api/admin/stats')).status).toBe(403);
  });
});

describe('Admin features', () => {
  let admin;
  let owner;
  let reporter;

  beforeEach(async () => {
    admin = await loggedInClient({ role: 'admin', name: 'Admin' });
    owner = await loggedInClient({ name: 'Owner' });
    reporter = await loggedInClient({ name: 'Reporter' });
  });

  it('lists users with emails but never password hashes', async () => {
    const res = await admin.client.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].email).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('flags a report once per user and shows it in the admin queue', async () => {
    const item = await insertItem(owner.user);
    const flag = () => reporter.client.post(`/api/items/${item._id}/flag`).send({ reason: 'Looks like spam' });

    expect((await flag()).status).toBe(201);
    expect((await flag()).status).toBe(409);
    expect((await owner.client.post(`/api/items/${item._id}/flag`).send({ reason: 'My own' })).status).toBe(400);

    const queue = await admin.client.get('/api/admin/items?view=flagged');
    expect(queue.body.data).toHaveLength(1);
    expect(queue.body.data[0]).toMatchObject({ flagCount: 1, flags: [{ reason: 'Looks like spam' }] });

    const dismissed = await admin.client.post(`/api/admin/items/${item._id}/dismiss-flags`);
    expect(dismissed.body.data.flagCount).toBe(0);
  });

  it('removes an inappropriate report, hides it publicly and closes its claims', async () => {
    const item = await insertItem(owner.user, { type: 'found' });
    await reporter.client
      .post(`/api/items/${item._id}/claims`)
      .send({ message: 'This is mine, it has my initials engraved on it.' });

    const res = await admin.client.post(`/api/admin/items/${item._id}/remove`).send({ reason: 'Offensive content' });
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);

    // Hidden from other users, still visible to the owner (with the reason).
    expect((await reporter.client.get(`/api/items/${item._id}`)).status).toBe(404);
    const ownView = await owner.client.get(`/api/items/${item._id}`);
    expect(ownView.body.data).toMatchObject({ removed: true, removedReason: 'Offensive content' });
    expect((await Claim.findOne({ item: item._id })).status).toBe('rejected');

    // The owner cannot edit a removed report; an admin can restore it.
    expect((await owner.client.patch(`/api/items/${item._id}`).field('title', 'Back again')).status).toBe(403);
    const restored = await admin.client.post(`/api/admin/items/${item._id}/restore`);
    expect(restored.body.data.removed).toBe(false);
    expect((await reporter.client.get(`/api/items/${item._id}`)).status).toBe(200);
  });

  it('can deactivate a user, who then loses their session', async () => {
    const res = await admin.client.patch(`/api/admin/users/${owner.user._id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect((await owner.client.get('/api/auth/me')).status).toBe(401);
  });

  it('cannot deactivate itself', async () => {
    const res = await admin.client.patch(`/api/admin/users/${admin.user._id}`).send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('lets an admin delete any report', async () => {
    const item = await insertItem(await createUser());
    expect((await admin.client.delete(`/api/items/${item._id}`)).status).toBe(204);
    expect(await Item.findById(item._id)).toBeNull();
  });
});
