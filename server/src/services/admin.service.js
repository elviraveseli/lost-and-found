import { Item } from '../models/Item.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { paginationMeta } from '../utils/response.js';
import { toItemDTO, toUserDTO } from '../utils/serializers.js';
import { rejectPendingClaimsForItem } from './claim.service.js';
import { notifySafely } from './notification.service.js';

export async function listUsers({ q, role, page, limit }) {
  const filter = {};
  if (role) filter.role = role;
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { users: users.map(toUserDTO), meta: paginationMeta(page, limit, total) };
}

export async function setUserActive(id, admin, isActive) {
  if (id === admin.id) throw AppError.badRequest('You cannot deactivate your own account');
  const user = await User.findByIdAndUpdate(id, { isActive }, { returnDocument: 'after' }).lean();
  if (!user) throw AppError.notFound('User');
  return toUserDTO(user);
}

export async function listItems({ q, view, page, limit }, admin) {
  const filter = {};
  if (view === 'flagged') Object.assign(filter, { flagCount: { $gt: 0 }, removed: false });
  if (view === 'removed') filter.removed = true;
  if (q) filter.$text = { $search: q };

  const sort = view === 'flagged' ? { flagCount: -1, createdAt: -1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([
    Item.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name')
      .lean(),
    Item.countDocuments(filter),
  ]);
  return { items: items.map((i) => toItemDTO(i, admin)), meta: paginationMeta(page, limit, total) };
}

// Soft delete: the report is hidden from everyone but its owner and admins, and
// can be restored if it was removed by mistake.
export async function removeItem(id, admin, reason) {
  const item = await Item.findOneAndUpdate(
    { _id: id, removed: false },
    { removed: true, removedAt: new Date(), removedReason: reason },
    { returnDocument: 'after' },
  ).populate('owner', 'name');
  if (!item) {
    if (!(await Item.exists({ _id: id }))) throw AppError.notFound('Report');
    throw AppError.conflict('This report has already been removed');
  }

  await rejectPendingClaimsForItem(item, 'The report was removed by a moderator.');
  await notifySafely({
    user: item.owner._id,
    type: 'report_removed',
    title: `Your report "${item.title}" was removed by a moderator`,
    body: `Reason: ${reason}`,
    link: `/items/${item._id}`,
  });
  return toItemDTO(item, admin);
}

export async function restoreItem(id, admin) {
  const item = await Item.findOneAndUpdate(
    { _id: id, removed: true },
    { removed: false, $unset: { removedAt: 1, removedReason: 1 }, flags: [], flagCount: 0 },
    { returnDocument: 'after' },
  ).populate('owner', 'name');
  if (!item) throw AppError.notFound('Removed report');
  return toItemDTO(item, admin);
}

export async function dismissFlags(id, admin) {
  const item = await Item.findByIdAndUpdate(
    id,
    { flags: [], flagCount: 0 },
    { returnDocument: 'after' },
  ).populate('owner', 'name');
  if (!item) throw AppError.notFound('Report');
  return toItemDTO(item, admin);
}

export async function stats() {
  const [users, openItems, resolvedItems, flagged, removed] = await Promise.all([
    User.countDocuments(),
    Item.countDocuments({ status: 'open', removed: false }),
    Item.countDocuments({ status: 'resolved', removed: false }),
    Item.countDocuments({ flagCount: { $gt: 0 }, removed: false }),
    Item.countDocuments({ removed: true }),
  ]);
  return { users, openItems, resolvedItems, flagged, removed };
}
