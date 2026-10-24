import { z } from 'zod';
import { CATEGORIES, ITEM_TYPES } from '../models/Item.js';
import { pagination } from './common.js';

// Report forms are sent as multipart/form-data (because of the optional image),
// so every field arrives as a string and must be coerced.
const DAY_MS = 24 * 60 * 60 * 1000;

const itemDate = z.coerce
  .date({ error: 'Enter a valid date' })
  .refine((d) => d.getTime() <= Date.now() + DAY_MS, 'Date cannot be in the future')
  .refine((d) => d.getFullYear() >= 2000, 'Date is too far in the past');

const itemFields = {
  type: z.enum(ITEM_TYPES),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
  category: z.enum(CATEGORIES),
  date: itemDate,
  location: z.string().trim().min(2, 'Location must be at least 2 characters').max(120),
};

export const createItemSchema = z.strictObject(itemFields);

export const updateItemSchema = z
  .strictObject({
    ...Object.fromEntries(Object.entries(itemFields).map(([k, v]) => [k, v.optional()])),
    removeImage: z.enum(['true', 'false']).optional(),
  });

export const listItemsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(ITEM_TYPES).optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  location: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'date']).default('newest'),
  ...pagination,
});

export const myItemsQuery = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('all'),
  ...pagination,
});

export const flagSchema = z.strictObject({
  reason: z.string().trim().min(5, 'Please give a short reason').max(300),
});
