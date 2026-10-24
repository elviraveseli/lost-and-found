import { Router } from 'express';
import * as notifications from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { listNotificationsQuery } from '../validators/notification.validators.js';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: listNotificationsQuery }), notifications.list);
router.get('/unread-count', notifications.unreadCount);
router.post('/read-all', notifications.markAllRead);
router.post('/:id/read', validate({ params: idParams }), notifications.markRead);

export default router;
