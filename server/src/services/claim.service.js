import { Claim } from '../models/Claim.js';
import { Item } from '../models/Item.js';
import { AppError } from '../utils/AppError.js';
import { paginationMeta } from '../utils/response.js';
import { toClaimDTO } from '../utils/serializers.js';
import { notify, notifySafely } from './notification.service.js';

const POPULATE_CLAIM = [
  { path: 'item', select: 'title type status' },
  { path: 'claimant', select: 'name email' },
  { path: 'itemOwner', select: 'name email' },
];

const DUPLICATE_KEY = 11000;

export async function createClaim(itemId, user, message) {
  const item = await Item.findOne({ _id: itemId, removed: false });
  if (!item) throw AppError.notFound('Report');

  // Claims are for "this found item is mine". Lost reports are answered through
  // match suggestions instead.
  if (item.type !== 'found') throw AppError.badRequest('Claims can only be submitted for found items');
  if (item.owner.toString() === user.id) throw AppError.forbidden('You cannot claim your own report');
  if (item.status !== 'open') throw AppError.conflict('This item has already been returned to its owner');

  let claim;
  try {
    claim = await Claim.create({ item: item._id, claimant: user.id, itemOwner: item.owner, message });
  } catch (err) {
    // The partial unique index guarantees this even if two requests arrive at
    // the same time; checking with findOne first would have a race condition.
    if (err.code === DUPLICATE_KEY) throw AppError.conflict('You already have a pending claim for this item');
    throw err;
  }

  // The notification deliberately does not include the claim message.
  await notifySafely({
    user: item.owner,
    type: 'claim_received',
    title: `New claim for "${item.title}"`,
    body: `${user.name} believes this item is theirs. Review the claim to accept or reject it.`,
    link: `/items/${item._id}/claims`,
  });

  await claim.populate(POPULATE_CLAIM);
  return toClaimDTO(claim, user);
}

// Claims on a single item: only its owner or an admin may read them, because
// claim messages may contain private details (e.g. what is inside a wallet).
export async function listClaimsForItem(itemId, user) {
  const item = await Item.findById(itemId).lean();
  if (!item) throw AppError.notFound('Report');
  if (item.owner.toString() !== user.id && user.role !== 'admin') {
    throw AppError.forbidden('Only the owner of this report can view its claims');
  }
  const claims = await Claim.find({ item: item._id }).sort({ createdAt: -1 }).populate(POPULATE_CLAIM).lean();
  return claims.map((c) => toClaimDTO(c, user));
}

async function listClaims(filter, user, { status, page, limit }) {
  if (status !== 'all') filter.status = status;
  const [claims, total] = await Promise.all([
    Claim.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE_CLAIM)
      .lean(),
    Claim.countDocuments(filter),
  ]);
  return { claims: claims.map((c) => toClaimDTO(c, user)), meta: paginationMeta(page, limit, total) };
}

export const listMyClaims = (user, query) => listClaims({ claimant: user.id }, user, query);
export const listReceivedClaims = (user, query) => listClaims({ itemOwner: user.id }, user, query);

export async function getClaim(id, user) {
  const claim = await Claim.findById(id).populate(POPULATE_CLAIM).lean();
  const allowed =
    claim &&
    (claim.claimant._id.toString() === user.id ||
      claim.itemOwner._id.toString() === user.id ||
      user.role === 'admin');
  // 404 rather than 403, so unrelated users cannot even confirm a claim exists.
  if (!allowed) throw AppError.notFound('Claim');
  return toClaimDTO(claim, user);
}

/**
 * Accept or reject a claim. Only the owner of the report may decide.
 *
 * Accepting has to change several documents consistently: the claim, the item
 * and any other pending claims. MongoDB transactions need a replica set, which
 * a simple local install does not have, so each step is a *conditional atomic
 * update* (it only applies if the document is still in the expected state). If
 * the second step fails, the first one is rolled back.
 */
export async function decideClaim(id, user, { decision, note }) {
  const claim = await Claim.findById(id).lean();
  if (!claim) throw AppError.notFound('Claim');
  if (claim.itemOwner.toString() !== user.id) {
    throw AppError.forbidden('Only the owner of this report can decide on claims');
  }
  if (claim.status !== 'pending') throw AppError.conflict(`This claim has already been ${claim.status}`);

  const decidedAt = new Date();

  // Step 1: move the claim from pending to the decision (fails if someone else
  // changed it in the meantime, e.g. the claimant withdrew it).
  const decided = await Claim.findOneAndUpdate(
    { _id: claim._id, status: 'pending' },
    { status: decision, decidedAt, decisionNote: note },
    { returnDocument: 'after' },
  );
  if (!decided) throw AppError.conflict('This claim is no longer pending');

  const item = await Item.findById(claim.item).lean();

  if (decision === 'accepted') {
    // Step 2: resolve the item, but only if it is still open.
    const resolved = await Item.findOneAndUpdate(
      { _id: claim.item, status: 'open', removed: false },
      { status: 'resolved', resolvedAt: decidedAt, resolvedClaim: claim._id },
      { returnDocument: 'after' },
    );
    if (!resolved) {
      // Roll back step 1 so the data stays consistent.
      await Claim.updateOne(
        { _id: claim._id },
        { status: 'pending', $unset: { decidedAt: 1, decisionNote: 1 } },
      );
      throw AppError.conflict('This report is no longer open');
    }
    // Step 3: every other pending claim on this item is now automatically rejected.
    await rejectPendingClaimsForItem(resolved, 'Another claim for this item was accepted.');
  }

  await notify({
    user: claim.claimant,
    type: decision === 'accepted' ? 'claim_accepted' : 'claim_rejected',
    title: decision === 'accepted' ? `Your claim for "${item?.title}" was accepted` : `Your claim for "${item?.title}" was not accepted`,
    body:
      decision === 'accepted'
        ? 'Open the claim to see how to contact the finder.'
        : 'The finder could not confirm that this item is yours.',
    link: '/dashboard?tab=claims',
  });

  await decided.populate(POPULATE_CLAIM);
  return toClaimDTO(decided, user);
}

export async function withdrawClaim(id, user) {
  const claim = await Claim.findOneAndUpdate(
    { _id: id, claimant: user.id, status: 'pending' },
    { status: 'withdrawn', decidedAt: new Date() },
    { returnDocument: 'after' },
  ).populate(POPULATE_CLAIM);
  if (!claim) {
    const exists = await Claim.exists({ _id: id, claimant: user.id });
    if (!exists) throw AppError.notFound('Claim');
    throw AppError.conflict('Only pending claims can be withdrawn');
  }
  return toClaimDTO(claim, user);
}

// Used when an item is resolved, accepted or removed: close every remaining
// pending claim and let each claimant know.
export async function rejectPendingClaimsForItem(item, note) {
  const pending = await Claim.find({ item: item._id, status: 'pending' }).select('claimant').lean();
  if (pending.length === 0) return 0;

  await Claim.updateMany(
    { _id: { $in: pending.map((c) => c._id) }, status: 'pending' },
    { status: 'rejected', decidedAt: new Date(), decisionNote: note },
  );
  await Promise.all(
    pending.map((c) =>
      notifySafely({
        user: c.claimant,
        type: 'claim_rejected',
        title: `Your claim for "${item.title}" was closed`,
        body: note,
        link: '/dashboard?tab=claims',
      }),
    ),
  );
  return pending.length;
}
