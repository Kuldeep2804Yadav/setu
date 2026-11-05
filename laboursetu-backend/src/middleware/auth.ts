import { Request, Response, NextFunction } from 'express';
import { prisma, Role } from '../database/index.js';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../utils/errors.js';
import { hashToken } from '../utils/crypto.js';
import { AuthUser } from '../shared/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

interface CachedSession {
  sessionId: string;
  user: AuthUser;
  cachedAt: number;
  expiresAt: Date;
}

// 60-second in-memory session cache to avoid repeated cloud DB roundtrips on parallel requests
const SESSION_CACHE_TTL_MS = 60 * 1000;
const sessionCache = new Map<string, CachedSession>();

// Periodic prune to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [hash, entry] of sessionCache.entries()) {
    if (now - entry.cachedAt > SESSION_CACHE_TTL_MS || entry.expiresAt.getTime() <= now) {
      sessionCache.delete(hash);
    }
  }
}, 5 * 60 * 1000).unref();

export function invalidateSessionCache(tokenHash?: string): void {
  if (tokenHash) {
    sessionCache.delete(tokenHash);
  } else {
    sessionCache.clear();
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract session token from HTTP-only cookie or Authorization header fallback
    let rawToken = req.cookies?.[config.sessionCookieName];
    if (!rawToken && req.headers.authorization?.startsWith('Bearer ')) {
      rawToken = req.headers.authorization.substring(7).trim();
    }

    if (!rawToken) {
      throw new UnauthorizedError('Authentication session required');
    }

    const tokenHash = hashToken(rawToken);
    const now = Date.now();

    // Fast path: In-memory cache hit (0ms)
    const cached = sessionCache.get(tokenHash);
    if (
      cached &&
      now - cached.cachedAt < SESSION_CACHE_TTL_MS &&
      cached.expiresAt.getTime() > now
    ) {
      req.sessionId = cached.sessionId;
      req.user = cached.user;
      return next();
    }

    // 2. Query session from database (Atlas)
    const session = await prisma.session.findFirst({
      where: {
        token: tokenHash,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!session || !session.user || !session.user.isActive) {
      sessionCache.delete(tokenHash);
      throw new UnauthorizedError('Invalid or expired session');
    }

    const authUser: AuthUser = {
      id: session.user.id,
      organizationId: session.organizationId,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
      role: session.user.role as Role,
      organization: {
        id: session.user.organization.id,
        name: session.user.organization.name,
        slug: session.user.organization.slug,
        code: session.user.organization.code,
        currency: session.user.organization.currency,
        gstin: session.user.organization.gstin,
        phone: session.user.organization.phone,
        address: session.user.organization.address,
      },
    };

    // Store in in-memory cache
    sessionCache.set(tokenHash, {
      sessionId: session.id,
      user: authUser,
      cachedAt: now,
      expiresAt: session.expiresAt,
    });

    req.sessionId = session.id;
    req.user = authUser;

    next();
  } catch (error) {
    next(error);
  }
}
