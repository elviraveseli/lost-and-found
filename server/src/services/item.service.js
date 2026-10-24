import { logger } from '../config/logger.js';
import { Claim } from '../models/Claim.js';
import { Item } from '../models/Item.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { paginationMeta } from '../utils/response.js';
import { toItemDTO } from '../utils/serializers.js';
import { rejectPendingClaimsForItem } from './claim.service.js';
import { findMatches, NOTIFY_MATCH_SCORE } from './matching.service.js';
import { notifySafely } from './notification.service.js';
import { deleteImage, saveImage } from './storage.service.js';

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  date: { date: -1 },
};

const isOwner = (item, user) => Boolean(user) && item.owner._id.toString() === user.id;

// Load an item the given user is allowed to see. Removed items are visible only
// to their owner and admins; everyone else gets a 404 (we do not reveal that
// a removed report exists).
async function loadVisibleItem(id, user) {
  const item = await Item.findById(id).populate('owner', 'name');
  if (!item) throw AppError.notFound('Report');
  if (item.removed && !isOwner(item, user) && user?.role !== 'admin') throw AppError.notFound('Report');
  return item;
}

async function loadOwnItem(id, user) {
  const item = await loadVisibleItem(id, user);
  if (!isOwner(item, user)) throw AppError.forbidden('Only the owner of this report can do that');
  return item;
}

export async function listItems(query, viewer) {
  const { q, type, category, status, location, from, to, sort, page, limit } = query;

  // Every value below comes from the Zod-validated query, so it is a plain
  // string/date/number. That (plus mongoose's strictQuery) prevents NoSQL
  // operator injection such as ?status[$ne]=x.
  const filter = { removed: false };
  if (status !== 'all') filter.status = status;
  if (type) filter.type = type;
  if (category) filter.category = category;
  if (location) filter.location = { $regex: escapeRegex(location), $options: 'i' };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  let sortSpec = SORTS[sort];
  let projection;
  if (q) {
    filter.$text = { $search: q };
    projection = { score: { $meta: 'textScore' } };
    sortSpec = { score: { $meta: 'textScore' }, ...sortSpec };
  }

  const [items, total] = await Promise.all([
    Item.find(filter, projection)
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name')
      .lean(),
    Item.countDocuments(filter),
  ]);

  return { items: items.map((i) => toItemDTO(i, viewer)), meta: paginationMeta(page, limit, total) };
}

export async function listMyItems(user, { status, page, limit }) {
  const filter = { owner: user.id };
  if (status !== 'all') filter.status = status;

  const [items, total] = await Promise.all([
    Item.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name')
      .lean(),
    Item.countDocuments(filter),
  ]);

  // Show the owner how many claims are waiting for a decision on each report.
  const pending = await Claim.aggregate([
    { $match: { item: { $in: items.map((i) => i._id) }, status: 'pending' } },
    { $group: { _id: '$item', count: { $sum: 1 } } },
  ]);
  const pendingByItem = new Map(pending.map((p) => [p._id.toString(), p.count]));

  return {
    items: items.map((i) => ({ ...toItemDTO(i, user), pendingClaims: pendingByItem.get(i._id.toString()) ?? 0 })),
    meta: paginationMeta(page, limit, total),
  };
}

export async function getItem(id, viewer) {
  return toItemDTO(await loadVisibleItem(id, viewer), viewer);
}

export async function createItem(data, file, user) {
  const image = file ? await saveImage(file) : undefined;
  let item;
  try {
    // The owner is ALWAYS the authenticated user, never a value from the request.
    item = await Item.create({ ...data, image, owner: user.id });
  } catch (err) {
    if (image) await deleteImage(image.key); // do not leave orphaned files behind
    throw err;
  }
  await item.populate('owner', 'name');

  await notifyAboutMatches(item);
  return toItemDTO(item, user);
}

export async function updateItem(id, data, file, user) {
  const item = await loadOwnItem(id, user);
  if (item.removed) throw AppError.forbidden('This report was removed by a moderator and cannot be edited');

  const { removeImage, ...fields } = data;
  const oldImageKey = item.image?.key;
  const newImage = file ? await saveImage(file) : undefined;

  item.set(fields);
  if (newImage) item.image = newImage;
  else if (removeImage === 'true') item.image = undefined;

  try {
    await item.save();
  } catch (err) {
    if (newImage) await deleteImage(newImage.key);
    throw err;
  }

  // Delete the previous file only after the database update succeeded.
  if (oldImageKey && oldImageKey !== item.image?.key) await deleteImage(oldImageKey);
  return toItemDTO(item, user);
}

export async function deleteItem(id, user) {
  const item = await loadVisibleItem(id, user);
  if (!isOwner(item, user) && user.role !== 'admin') {
    throw AppError.forbidden('Only the owner of this report can do that');
  }
  await Claim.deleteMany({ item: item._id });
  await item.deleteOne();
  await deleteImage(item.image?.key);
}

export async function resolveItem(id, user) {
  const item = await loadOwnItem(id, user);
  if (item.removed) throw AppError.forbidden('This report was removed by a moderator');

  // Conditional update: only succeeds if the report is still open, so two
  // concurrent requests cannot both "resolve" it.
  const updated = await Item.findOneAndUpdate(
    { _id: item._id, status: 'open' },
    { status: 'resolved', resolvedAt: new Date() },
    { returnDocument: 'after' },
  ).populate('owner', 'name');
  if (!updated) throw AppError.conflict('This report is already resolved');

  await rejectPendingClaimsForItem(updated, 'The owner marked this report as resolved.');
  return toItemDTO(updated, user);
}

export async function flagItem(id, user, reason) {
  const item = await loadVisibleItem(id, user);
  if (isOwner(item, user)) throw AppError.badRequest('You cannot flag your own report');

  // One flag per user, enforced atomically in the update filter.
  const result = await Item.updateOne(
    { _id: item._id, 'flags.user': { $ne: user.id } },
    { $push: { flags: { user: user.id, reason } }, $inc: { flagCount: 1 } },
  );
  if (result.modifiedCount === 0) throw AppError.conflict('You have already flagged this report');
  return { flagged: true };
}

export async function getMatches(id, user) {
  const item = await loadVisibleItem(id, user);
  // Match suggestions are only for the report's owner (and admins): they are a
  // tool for the person searching, not a public list.
  if (!isOwner(item, user) && user.role !== 'admin') {
    throw AppError.forbidden('Only the owner of this report can see match suggestions');
  }
  if (item.status !== 'open' || item.removed) return [];

  const matches = await findMatches(item);
  return matches.map((m) => ({
    label: 'Potential match',
    score: m.score,
    reasons: m.reasons,
    item: toItemDTO(m.item, user),
  }));
}

// After a new report is created, tell the owners of strongly matching reports
// (and the creator) that there may be a match. Failures are logged, never thrown:
// creating the report must succeed even if matching has a problem.
async function notifyAboutMatches(item) {
  try {
    const matches = (await findMatches(item, { limit: 5 })).filter((m) => m.score >= NOTIFY_MATCH_SCORE);
    if (matches.length === 0) return;

    await Promise.all(
      matches.map((m) =>
        notifySafely({
          user: m.item.owner._id,
          type: 'potential_match',
          title: `Potential match for "${m.item.title}"`,
          body: `A new ${item.type} report may match your report (score ${m.score}/100). Review it on your report page.`,
          link: `/items/${m.item._id}`,
        }),
      ),
    );
    await notifySafely({
      user: item.owner._id ?? item.owner,
      type: 'potential_match',
      title: `${matches.length} potential match${matches.length > 1 ? 'es' : ''} for "${item.title}"`,
      body: 'We found existing reports that may match yours. These are suggestions, not confirmed matches.',
      link: `/items/${item._id}`,
    });
  } catch (err) {
    logger.warn({ err, itemId: item._id.toString() }, 'Match notification failed');
  }
}
