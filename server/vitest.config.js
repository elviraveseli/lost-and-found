import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // All test files share one MongoDB test database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      // Test-only secret; real secrets come from the environment / .env file.
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
      BCRYPT_ROUNDS: '4',
      UPLOAD_DIR: './tests/.uploads',
      LOGIN_RATE_LIMIT: '1000',
      MONGODB_URI_TEST: process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/lost_found_test',
    },
  },
});
