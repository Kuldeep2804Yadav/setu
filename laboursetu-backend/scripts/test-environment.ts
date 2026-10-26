import dotenv from 'dotenv';
dotenv.config();

export function useTestDatabase(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value || process.env.ALLOW_TEST_DATABASE_CLEANUP !== 'true') {
    throw new Error('Integration tests clear all data. Set TEST_DATABASE_URL and ALLOW_TEST_DATABASE_CLEANUP=true for a disposable database.');
  }
  const test = new URL(value);
  const databaseName = decodeURIComponent(test.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(test.protocol) || !/(?:^|_)test(?:_|$)/i.test(databaseName)) {
    throw new Error('Disposable test database name must contain a separate test segment.');
  }
  const current = process.env.DATABASE_URL;
  if (current) {
    const app = new URL(current);
    if (app.hostname === test.hostname && (app.port || '5432') === (test.port || '5432') && app.pathname === test.pathname) {
      throw new Error('TEST_DATABASE_URL must target a different database from DATABASE_URL.');
    }
  }
  process.env.DATABASE_URL = value;
  process.env.NODE_ENV = 'test';
  return value;
}
