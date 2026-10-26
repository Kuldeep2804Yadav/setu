import { defineConfig } from 'vitest/config';
import path from 'path';
import { useTestDatabase } from './scripts/test-environment.js';

useTestDatabase();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false, // Run test files serially to avoid database race conditions
    setupFiles: [path.resolve(__dirname, './tests/setup.ts')],
  },
});
