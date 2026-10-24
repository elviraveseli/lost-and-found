import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { config } from '../src/config/env.js';
import { Claim } from '../src/models/Claim.js';
import { Item } from '../src/models/Item.js';
import { Notification } from '../src/models/Notification.js';
import { User } from '../src/models/User.js';

const models = [User, Item, Claim, Notification];

beforeAll(async () => {
  // Safety guard: tests wipe collections, so they must NEVER point at a
  // development or production database.
  const dbName = new URL(config.mongoUri).pathname.slice(1);
  if (config.NODE_ENV !== 'test' || !dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against database "${dbName}". Use a database whose name ends in "_test".`);
  }

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  // Make sure unique / partial / text indexes exist before tests rely on them.
  await Promise.all(models.map((m) => m.syncIndexes()));
});

beforeEach(async () => {
  await Promise.all(models.map((m) => m.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await fs.rm(config.UPLOAD_DIR, { recursive: true, force: true });
});
