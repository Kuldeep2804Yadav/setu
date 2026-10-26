import { prisma } from '../database/index.js';

export class CleanupService {
  async cleanupExpiredSessionsAndTokens(): Promise<{
    expiredSessionsDeleted: number;
    expiredTokensDeleted: number;
    expiredRateLimitsDeleted: number;
  }> {
    const now = new Date();

    const [sessionsResult, tokensResult, rateLimitsResult] = await Promise.all([
      prisma.session.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
        },
      }),
      prisma.rateLimitEntry.deleteMany({
        where: { expireAt: { lt: now } },
      }),
    ]);

    return {
      expiredSessionsDeleted: sessionsResult.count,
      expiredTokensDeleted: tokensResult.count,
      expiredRateLimitsDeleted: rateLimitsResult.count,
    };
  }
}

export const cleanupService = new CleanupService();
