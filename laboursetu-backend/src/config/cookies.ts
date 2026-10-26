import type { CookieOptions } from 'express';
import { config } from './index.js';

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProd || config.cookieSameSite === 'none',
    sameSite: config.cookieSameSite,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
    path: '/',
  };
}
