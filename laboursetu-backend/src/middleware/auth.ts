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

    // 2. Query session from database
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
      throw new UnauthorizedError('Invalid or expired session');
    }

    req.sessionId = session.id;
    req.user = {
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

    next();
  } catch (error) {
    next(error);
  }
}
