import { Router } from 'express';
import * as claims from '../controllers/claim.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { decideClaimSchema, listClaimsQuery } from '../validators/claim.validators.js';
import { idParams } from '../validators/common.js';

const router = Router();
router.use(requireAuth);

router.get('/mine', validate({ query: listClaimsQuery }), claims.listMine);
router.get('/received', validate({ query: listClaimsQuery }), claims.listReceived);
router.get('/:id', validate({ params: idParams }), claims.getOne);
router.post('/:id/decision', validate({ params: idParams, body: decideClaimSchema }), claims.decide);
router.post('/:id/withdraw', validate({ params: idParams }), claims.withdraw);

export default router;
