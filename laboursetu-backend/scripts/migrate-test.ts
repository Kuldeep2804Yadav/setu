import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { useTestDatabase } from './test-environment.js';
useTestDatabase();
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('prisma'), 'migrate', 'deploy'], {
  stdio: 'inherit', env: process.env,
});
process.exit(result.status ?? 1);
