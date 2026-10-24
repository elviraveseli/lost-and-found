import { z } from 'zod';
import { pagination } from './common.js';

export const listNotificationsQuery = z.object({
  unreadOnly: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ...pagination,
});
