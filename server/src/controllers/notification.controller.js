import * as notificationService from '../services/notification.service.js';
import { sendSuccess } from '../utils/response.js';

export async function list(req, res) {
  const { notifications, meta } = await notificationService.listNotifications(req.user.id, req.validated.query);
  sendSuccess(res, notifications, { meta });
}

export async function unreadCount(req, res) {
  sendSuccess(res, { unread: await notificationService.unreadCount(req.user.id) });
}

export async function markRead(req, res) {
  sendSuccess(res, await notificationService.markRead(req.user.id, req.validated.params.id));
}

export async function markAllRead(req, res) {
  sendSuccess(res, await notificationService.markAllRead(req.user.id));
}
