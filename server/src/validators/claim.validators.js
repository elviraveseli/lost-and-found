import { z } from 'zod';
import { CLAIM_STATUSES } from '../models/Claim.js';
import { pagination } from './common.js';

export const createClaimSchema = z.strictObject({
  message: z
    .string()
    .trim()
    .min(20, 'Describe the item in at least 20 characters so the finder can verify it')
    .max(1000),
});

export const decideClaimSchema = z.strictObject({
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().trim().max(500).optional(),
});

export const listClaimsQuery = z.object({
  status: z.enum([...CLAIM_STATUSES, 'all']).default('all'),
  ...pagination,
});
