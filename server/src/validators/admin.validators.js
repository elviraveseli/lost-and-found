import { z } from 'zod';
import { ROLES } from '../models/User.js';
import { pagination } from './common.js';

export const adminUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  ...pagination,
});

export const adminItemsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  view: z.enum(['all', 'flagged', 'removed']).default('all'),
  ...pagination,
});

export const removeItemSchema = z.strictObject({
  reason: z.string().trim().min(3).max(300),
});

export const updateUserSchema = z.strictObject({
  isActive: z.boolean(),
});
