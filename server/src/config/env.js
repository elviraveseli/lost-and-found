import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

// Load the repo-root .env file if it exists. Node 22+ supports this natively,
// so we do not need the dotenv package. Real environment variables win.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = path.join(rootDir, '.env');
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/lost_found_dev'),
  MONGODB_URI_TEST: z.string().min(1).default('mongodb://127.0.0.1:27017/lost_found_test'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(720).default(24),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z
    .string()
    .default(path.join(rootDir, 'server', 'storage', 'uploads'))
    .transform((dir) => path.resolve(dir)),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(20).default(5),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: bool,
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Lost & Found <no-reply@example.com>'),
  APP_URL: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast on startup: a misconfigured server should never start serving.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  rootDir,
  mongoUri: env.NODE_ENV === 'test' ? env.MONGODB_URI_TEST : env.MONGODB_URI,
  emailEnabled: Boolean(env.SMTP_HOST),
};
