import { beforeEach, describe, expect, it } from 'vitest';
import { Claim } from '../src/models/Claim.js';
import { Item } from '../src/models/Item.js';
import { Notification } from '../src/models/Notification.js';
import { insertItem, loggedInClient } from './helpers.js';

const MESSAGE = 'It has my library card inside and a photo of my dog in the front pocket.';

describe('Claims workflow', () => {
  let finder; // owner of the found report
  let claimantA;
  let claimantB;
  let item;

  beforeEach(async () => {
    finder = await loggedInClient({ name: 'Finder' });
    claimantA = await loggedInClient({ name: 'Claimant A' });
    claimantB = await loggedInClient({ name: 'Claimant B' });
    item = await insertItem(finder.user, { type: 'found' });
  });

  const submit = (who, message = MESSAGE) => who.client.post(`/api/items/${item._id}/claims`).send({ message });

  it('lets a user claim a found item and notifies the owner without the private message', async () => {
    const res = await submit(claimantA);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', message: MESSAGE, viewerRole: 'claimant' });

    const notification = await Notification.findOne({ user: finder.user._id, type: 'claim_received' });
    expect(notification).not.toBeNull();
    expect(notification.body).not.toContain('library card');
  });

  it('prevents users from claiming their own report', async () => {
    const res = await submit(finder);
    expect(res.status).toBe(403);
  });

  it('prevents duplicate pending claims from the same user', async () => {
    expect((await submit(claimantA)).status).toBe(201);
    const duplicate = await submit(claimantA);
    expect(duplicate.status).toBe(409);
    expect(await Claim.countDocuments()).toBe(1);
  });

  it('allows a new claim after a previous one was rejected', async () => {
    const first = await submit(claimantA);
    await finder.client.post(`/api/claims/${first.body.data.id}/decision`).send({ decision: 'rejected' });
    expect((await submit(claimantA)).status).toBe(201);
  });

  it('only allows claims on found reports', async () => {
    const lostItem = await insertItem(finder.user, { type: 'lost' });
    const res = await claimantA.client.post(`/api/items/${lostItem._id}/claims`).send({ message: MESSAGE });
    expect(res.status).toBe(400);
  });

  it('validates the claim message', async () => {
    const res = await submit(claimantA, 'mine');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('message');
  });

  it('only shows claims on an item to its owner', async () => {
    await submit(claimantA);
    const asOwner = await finder.client.get(`/api/items/${item._id}/claims`);
    const asOther = await claimantB.client.get(`/api/items/${item._id}/claims`);

    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data).toHaveLength(1);
    expect(asOther.status).toBe(403);
  });

  it('hides a claim from unrelated users', async () => {
    const claim = (await submit(claimantA)).body.data;
    expect((await claimantA.client.get(`/api/claims/${claim.id}`)).status).toBe(200);
    expect((await finder.client.get(`/api/claims/${claim.id}`)).status).toBe(200);
    expect((await claimantB.client.get(`/api/claims/${claim.id}`)).status).toBe(404);
  });

  it('only lets the report owner decide on a claim', async () => {
    const claim = (await submit(claimantA)).body.data;
    const byClaimant = await claimantA.client.post(`/api/claims/${claim.id}/decision`).send({ decision: 'accepted' });
    const byOther = await claimantB.client.post(`/api/claims/${claim.id}/decision`).send({ decision: 'accepted' });
    expect(byClaimant.status).toBe(403);
    expect(byOther.status).toBe(403);
    expect((await Claim.findById(claim.id)).status).toBe('pending');
  });

  it('accepting a claim resolves the item, rejects other claims and shares contact details', async () => {
    const claimA = (await submit(claimantA)).body.data;
    const claimB = (await submit(claimantB)).body.data;

    const res = await finder.client
      .post(`/api/claims/${claimA.id}/decision`)
      .send({ decision: 'accepted', note: 'Details match. Let us meet at the station.' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('accepted');
    expect(res.body.data.decidedAt).toBeTruthy();
    // The owner now sees the claimant's email.
    expect(res.body.data.claimant.email).toBe(claimantA.user.email);

    const updatedItem = await Item.findById(item._id);
    expect(updatedItem.status).toBe('resolved');
    expect(updatedItem.resolvedClaim.toString()).toBe(claimA.id);
    expect((await Claim.findById(claimB.id)).status).toBe('rejected');

    // The accepted claimant sees the finder's contact details.
    const mine = await claimantA.client.get('/api/claims/mine');
    expect(mine.body.data[0].ownerContact).toEqual({ name: 'Finder', email: finder.user.email });

    // The rejected claimant does not.
    const theirs = await claimantB.client.get('/api/claims/mine');
    expect(theirs.body.data[0].status).toBe('rejected');
    expect(theirs.body.data[0].ownerContact).toBeUndefined();

    expect(await Notification.countDocuments({ user: claimantA.user._id, type: 'claim_accepted' })).toBe(1);
    expect(await Notification.countDocuments({ user: claimantB.user._id, type: 'claim_rejected' })).toBe(1);
  });

  it('does not reveal contact details before a claim is accepted', async () => {
    await submit(claimantA);
    const received = await finder.client.get('/api/claims/received');
    expect(received.body.data[0].claimant.email).toBeUndefined();
    const mine = await claimantA.client.get('/api/claims/mine');
    expect(mine.body.data[0].ownerContact).toBeUndefined();
  });

  it('cannot decide the same claim twice, and resolved items accept no new claims', async () => {
    const claim = (await submit(claimantA)).body.data;
    await finder.client.post(`/api/claims/${claim.id}/decision`).send({ decision: 'accepted' });

    const again = await finder.client.post(`/api/claims/${claim.id}/decision`).send({ decision: 'rejected' });
    expect(again.status).toBe(409);
    expect((await submit(claimantB)).status).toBe(409);
  });

  it('lets a claimant withdraw a pending claim', async () => {
    const claim = (await submit(claimantA)).body.data;
    const res = await claimantA.client.post(`/api/claims/${claim.id}/withdraw`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('withdrawn');

    const decide = await finder.client.post(`/api/claims/${claim.id}/decision`).send({ decision: 'accepted' });
    expect(decide.status).toBe(409);
  });

  it('closes pending claims when the owner marks the item as resolved', async () => {
    const claim = (await submit(claimantA)).body.data;
    await finder.client.post(`/api/items/${item._id}/resolve`);
    expect((await Claim.findById(claim.id)).status).toBe('rejected');
  });
});
