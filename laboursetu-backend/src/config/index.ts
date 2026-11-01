import dotenv from 'dotenv';
import path from 'path';

// Read only this independent application's environment.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function parseCookieSameSite(): 'lax' | 'strict' | 'none' {
  const value =
    process.env.COOKIE_SAME_SITE ||
    (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
  if (value !== 'lax' && value !== 'strict' && value !== 'none') {
    throw new Error('COOKIE_SAME_SITE must be lax, strict or none');
  }
  return value;
}
const cookieSameSite = parseCookieSameSite();

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32 ||
    process.env.SESSION_SECRET.startsWith('replace-'))
) {
  throw new Error('Set a private SESSION_SECRET of at least 32 characters in production');
}

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) return '';
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return trimmed;
  }
}

const rawCorsOrigin =
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL ||
  process.env.CORS_ORIGIN ||
  'http://localhost:3000';

const allowedOrigins = rawCorsOrigin
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  corsOrigin: allowedOrigins[0] || 'http://localhost:3000',
  allowedOrigins,
  cookieSameSite,
  cookieDomain: process.env.COOKIE_DOMAIN,
  sessionSecret:
    process.env.SESSION_SECRET || 'development-only-do-not-use-in-production',
  sessionCookieName: 'laboursetu_session',
  sessionExpiryDays: 7,
};
