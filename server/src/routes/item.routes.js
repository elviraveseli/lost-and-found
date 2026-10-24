import { Router } from 'express';
import * as claims from '../controllers/claim.controller.js';
import * as items from '../controllers/item.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { createClaimSchema } from '../validators/claim.validators.js';
import { idParams } from '../validators/common.js';
import {
  createItemSchema,
  flagSchema,
  listItemsQuery,
  myItemsQuery,
  updateItemSchema,
} from '../validators/item.validators.js';

const router = Router();

// Public reads (optionalAuth lets the response say whether you own a report).
router.get('/', optionalAuth, validate({ query: listItemsQuery }), items.list);
router.get('/mine', requireAuth, validate({ query: myItemsQuery }), items.listMine);
router.get('/:id', optionalAuth, validate({ params: idParams }), items.getOne);

// Multer must run before validation: it parses the multipart body into req.body.
router.post('/', requireAuth, uploadImage, validate({ body: createItemSchema }), items.create);
router.patch('/:id', requireAuth, uploadImage, validate({ params: idParams, body: updateItemSchema }), items.update);
router.delete('/:id', requireAuth, validate({ params: idParams }), items.remove);
router.post('/:id/resolve', requireAuth, validate({ params: idParams }), items.resolve);
router.post('/:id/flag', requireAuth, validate({ params: idParams, body: flagSchema }), items.flag);
router.get('/:id/matches', requireAuth, validate({ params: idParams }), items.matches);

// Claims nested under the item they belong to.
router.get('/:id/claims', requireAuth, validate({ params: idParams }), claims.listForItem);
router.post('/:id/claims', requireAuth, validate({ params: idParams, body: createClaimSchema }), claims.create);

export default router;
