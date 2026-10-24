import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { paginationMeta } from '../utils/response.js';
import { toNotificationDTO } from '../utils/serializers.js';
import { sendEmail } from './email.service.js';

// Creates an in-app notification and, if SMTP is configured, sends a short
// email. Notification text must never contain private claim messages or
// another user's contact details.
export async function notify({ user, type, title, body, link }) {
  const notification = await Notification.create({ user, type, title, body, link });

  if (config.emailEnabled) {
    // Fire and forget: a slow or failing mail server must not slow down or
    // break the request that triggered the notification.
    User.findById(user)
      .lean()
      .then((recipient) => {
        if (!recipient?.isActive) return;
        const url = link ? `${config.APP_URL}${link}` : config.APP_URL;
        return sendEmail({ to: recipient.email, subject: title, text: `${body ?? title}\n\nOpen: ${url}` });
      })
      .catch((err) => logger.warn({ err }, 'Notification email failed'));
  }
  return notification;
}

// For side effects (e.g. match suggestions) where a failed notification should
// be logged but must never fail the user's request.
export async function notifySafely(payload) {
  try {
    await notify(payload);
  } catch (err) {
    logger.warn({ err, type: payload.type }, 'Failed to create notification');
  }
}

export async function listNotifications(userId, { unreadOnly, page, limit }) {
  const filter = { user: userId };
  if (unreadOnly) filter.read = false;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, read: false }),
  ]);
  return {
    notifications: items.map(toNotificationDTO),
    meta: { ...paginationMeta(page, limit, total), unread },
  };
}

export async function unreadCount(userId) {
  return Notification.countDocuments({ user: userId, read: false });
}

export async function markRead(userId, notificationId) {
  // Filtering by user as well as id means you can only touch your own notifications.
  const n = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { read: true },
    { returnDocument: 'after' },
  ).lean();
  if (!n) throw AppError.notFound('Notification');
  return toNotificationDTO(n);
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany({ user: userId, read: false }, { read: true });
  return { updated: result.modifiedCount };
}
