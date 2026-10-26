import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { ForbiddenError } from '../utils/errors.js';
import { ErrorCode } from '../shared/index.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  // Safe read-only HTTP methods are exempt
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // CORS alone only prevents reading a response. Reject untrusted browser
  // mutation origins, including JSON requests and login/register attempts.
  const origin = req.get('origin');
  if (origin && !config.allowedOrigins.includes(origin)) {
    return next(new ForbiddenError('Unapproved request origin', ErrorCode.CSRF_INVALID));
  }

  // If request has cookie-based authentication, check CSRF defenses
  const hasSessionCookie = Boolean(req.cookies?.[config.sessionCookieName]);
  if (!hasSessionCookie) {
    // Non-cookie requests (e.g. initial login, register or bearer token) don't carry ambient browser credentials
    return next();
  }

  // 1. Verify custom request header present (browser cannot forge this from a simple HTML form or image)
  const hasCustomHeader = Boolean(
    req.headers['x-requested-with'] ||
    req.headers['x-laboursetu-client'] ||
    req.headers['x-csrf-token']
  );

  // 2. Or standard JSON Content-Type (requires browser CORS preflight check)
  const contentType = req.headers['content-type'] || '';
  const isJson = contentType.includes('application/json');

  // 3. Or Sec-Fetch-Site validation
  const secFetchSite = req.headers['sec-fetch-site'];
  const isSafeOrigin = secFetchSite === 'same-origin' || secFetchSite === 'same-site';

  if (!hasCustomHeader && !isJson && !isSafeOrigin) {
    return next(
      new ForbiddenError('Invalid CSRF protection header', ErrorCode.CSRF_INVALID)
    );
  }

  next();
}
