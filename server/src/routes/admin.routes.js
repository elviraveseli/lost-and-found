import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  adminItemsQuery,
  adminUsersQuery,
  removeItemSchema,
  updateUserSchema,
} from '../validators/admin.validators.js';
import { idParams } from '../validators/common.js';

const router = Router();

// Applied once to the whole router, so every admin endpoint (including ones
// added later) requires an authenticated admin.
router.use(requireAuth, requireRole('admin'));

router.get('/stats', admin.stats);
router.get('/users', validate({ query: adminUsersQuery }), admin.listUsers);
router.patch('/users/:id', validate({ params: idParams, body: updateUserSchema }), admin.updateUser);
router.get('/items', validate({ query: adminItemsQuery }), admin.listItems);
router.post('/items/:id/remove', validate({ params: idParams, body: removeItemSchema }), admin.removeItem);
router.post('/items/:id/restore', validate({ params: idParams }), admin.restoreItem);
router.post('/items/:id/dismiss-flags', validate({ params: idParams }), admin.dismissFlags);

export default router;
