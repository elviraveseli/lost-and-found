import { describe, expect, it } from 'vitest';
import { Notification } from '../src/models/Notification.js';
import { scoreMatch, tokenize } from '../src/services/matching.service.js';
import { createUser, insertItem, loggedInClient, validItem } from './helpers.js';

const day = (offset) => new Date(Date.UTC(2026, 5, 10 + offset));

const lostWallet = {
  type: 'lost',
  category: 'wallets-and-cards',
  title: 'Lost black leather wallet',
  description: 'Black leather wallet with red stitching, contains a library card.',
  date: day(0),
  location: 'Central Station',
};
const foundWallet = {
  type: 'found',
  category: 'wallets-and-cards',
  title: 'Found wallet, black leather',
  description: 'Black leather wallet with red stitching found on a bench.',
  date: day(1),
  location: 'Central Station, platform 4',
};

describe('Matching: scoreMatch (pure function)', () => {
  it('tokenizes text, removing stopwords and simple plurals', () => {
    expect([...tokenize('The Keys were found near the Café!')]).toEqual(['key', 'cafe']);
  });

  it('scores a strong match highly and explains why', () => {
    const { score, reasons } = scoreMatch(lostWallet, foundWallet);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(reasons).toEqual(
      expect.arrayContaining([
        'Same category (wallets-and-cards)',
        'Reported within 2 days of each other',
        expect.stringContaining('Shared keywords: black, leather, wallet'),
        expect.stringContaining('Similar location: central, station'),
      ]),
    );
  });

  it('is deterministic and symmetric', () => {
    expect(scoreMatch(lostWallet, foundWallet)).toEqual(scoreMatch(lostWallet, foundWallet));
    expect(scoreMatch(lostWallet, foundWallet)).toEqual(scoreMatch(foundWallet, lostWallet));
  });

  it('never matches two reports of the same type', () => {
    expect(scoreMatch(lostWallet, { ...foundWallet, type: 'lost' }).score).toBe(0);
  });

  it('never matches different categories', () => {
    expect(scoreMatch(lostWallet, { ...foundWallet, category: 'keys' }).score).toBe(0);
  });

  it('never matches an item found well before it was lost', () => {
    expect(scoreMatch(lostWallet, { ...foundWallet, date: day(-5) }).score).toBe(0);
  });

  it('gives fewer points as the dates move further apart', () => {
    const close = scoreMatch(lostWallet, foundWallet).score;
    const week = scoreMatch(lostWallet, { ...foundWallet, date: day(6) }).score;
    const month = scoreMatch(lostWallet, { ...foundWallet, date: day(25) }).score;
    const later = scoreMatch(lostWallet, { ...foundWallet, date: day(60) }).score;
    expect(close).toBeGreaterThan(week);
    expect(week).toBeGreaterThan(month);
    expect(month).toBeGreaterThan(later);
  });

  it('scores unrelated descriptions in the same category low', () => {
    const unrelated = {
      ...foundWallet,
      title: 'Pink card holder',
      description: 'Small plastic holder with a gym membership.',
      location: 'Airport',
      date: day(20),
    };
    expect(scoreMatch(lostWallet, unrelated).score).toBeLessThan(45);
  });
});

describe('Matching: API and notifications', () => {
  it('returns explainable potential matches to the report owner only', async () => {
    const loser = await loggedInClient();
    const finder = await createUser();
    const stranger = await loggedInClient();

    const today = new Date();
    const lost = await insertItem(loser.user, { ...lostWallet, date: today.toISOString() });
    await insertItem(finder, { ...foundWallet, date: today.toISOString() });
    await insertItem(finder, { ...foundWallet, title: 'Found keys', category: 'keys', date: today.toISOString() });

    const res = await loser.client.get(`/api/items/${lost._id}/matches`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ label: 'Potential match', item: { title: 'Found wallet, black leather' } });
    expect(res.body.data[0].reasons.length).toBeGreaterThan(0);
    // No contact details in suggestions.
    expect(res.body.data[0].item.owner.email).toBeUndefined();

    expect((await stranger.client.get(`/api/items/${lost._id}/matches`)).status).toBe(403);
  });

  it('notifies the owner of a matching report when a new report is created', async () => {
    const loser = await createUser();
    await insertItem(loser, { ...lostWallet, date: new Date().toISOString() });

    const { client, user: finder } = await loggedInClient();
    const req = client.post('/api/items');
    for (const [k, v] of Object.entries(validItem({ ...foundWallet, date: new Date().toISOString() }))) req.field(k, v);
    expect((await req).status).toBe(201);

    const toLoser = await Notification.find({ user: loser._id, type: 'potential_match' });
    const toFinder = await Notification.find({ user: finder._id, type: 'potential_match' });
    expect(toLoser).toHaveLength(1);
    expect(toFinder).toHaveLength(1);
    expect(toLoser[0].body).not.toContain(finder.email);
  });
});

describe('Notifications API', () => {
  it('lists, counts and marks only your own notifications as read', async () => {
    const alice = await loggedInClient();
    const bob = await loggedInClient();
    const mine = await Notification.create({ user: alice.user._id, type: 'claim_received', title: 'Hello' });
    const theirs = await Notification.create({ user: bob.user._id, type: 'claim_received', title: 'Private' });

    const list = await alice.client.get('/api/notifications');
    expect(list.body.data.map((n) => n.title)).toEqual(['Hello']);
    expect(list.body.meta.unread).toBe(1);

    expect((await alice.client.post(`/api/notifications/${theirs._id}/read`)).status).toBe(404);
    expect((await alice.client.post(`/api/notifications/${mine._id}/read`)).body.data.read).toBe(true);
    expect((await alice.client.get('/api/notifications/unread-count')).body.data.unread).toBe(0);
  });
});
