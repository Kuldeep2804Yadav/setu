import { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { prisma } from '../database/index.js';

/**
 * PostgreSQL-backed distributed rate limit store for multi-instance deployments
 */
export class PrismaRateLimitStore implements Store {
  windowMs: number = 60 * 1000;

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    const expireAt = new Date(now.getTime() + this.windowMs);

    // Atomic transaction to increment or reset expired bucket
    const entry = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimitEntry.findUnique({
        where: { key },
      });

      if (!existing || existing.expireAt <= now) {
        return tx.rateLimitEntry.upsert({
          where: { key },
          create: {
            key,
            points: 1,
            expireAt,
          },
          update: {
            points: 1,
            expireAt,
          },
        });
      }

      return tx.rateLimitEntry.update({
        where: { key },
        data: {
          points: { increment: 1 },
        },
      });
    });

    return {
      totalHits: entry.points,
      resetTime: entry.expireAt,
    };
  }

  async decrement(key: string): Promise<void> {
    await prisma.rateLimitEntry.updateMany({
      where: { key, points: { gt: 0 } },
      data: { points: { decrement: 1 } },
    }).catch(() => {});
  }

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimitEntry.deleteMany({
      where: { key },
    }).catch(() => {});
  }

  async resetAll(): Promise<void> {
    await prisma.rateLimitEntry.deleteMany().catch(() => {});
  }
}
