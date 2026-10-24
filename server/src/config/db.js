import mongoose from 'mongoose';
import { config } from './env.js';
import { logger } from './logger.js';

export async function connectDatabase(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Log only host and database name: the URI may contain credentials.
  const { host, name } = mongoose.connection;
  logger.info({ host, db: name }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
