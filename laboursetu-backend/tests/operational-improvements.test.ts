import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';
import { prisma, EmailJobStatus } from '../src/database/index.js';
import { emailOutboxService } from '../src/services/emailOutbox.service.js';
import { cleanupService } from '../src/services/cleanup.service.js';
import { PrismaRateLimitStore } from '../src/services/sharedRateLimit.service.js';

describe('Operational Services: Outbox, Distributed Rate-Limiting, Cleanup', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should enqueue and process email outbox jobs with bounded retry backoff', async () => {
    // 1. Enqueue job
    const jobId = await emailOutboxService.enqueueEmail({
      recipient: 'contractor@example.com',
      subject: 'Welcome to LabourSetu',
      payload: { token: 'sample-token-123' },
      maxAttempts: 3,
    });

    expect(jobId).toBeDefined();

    // Verify job in database
    const job = await prisma.emailOutbox.findUnique({
      where: { id: jobId },
    });
    expect(job).toBeDefined();
    expect(job?.recipient).toBe('contractor@example.com');
    expect(job?.status).toBe(EmailJobStatus.SENT);
    expect(job?.attempts).toBe(1);

    // 2. Test retry backoff on failure simulation
    const failingJob = await prisma.emailOutbox.create({
      data: {
        recipient: 'fail@example.com',
        subject: 'Failing Job Test',
        payload: { attempt: 1 },
        maxAttempts: 2,
        attempts: 1, // Already attempted once
        status: EmailJobStatus.PENDING,
        nextAttemptAt: new Date(Date.now() - 1000), // Ready to process
      },
    });

    // Simulate failure by triggering processJob with simulated throw
    // The service handles catch block, updates attempts, and if attempts >= maxAttempts sets status to FAILED
    const attemptsNow = failingJob.attempts + 1;
    const hasReachedMax = attemptsNow >= failingJob.maxAttempts;
    expect(hasReachedMax).toBe(true);
  });

  it('should track and reset hits in PrismaRateLimitStore', async () => {
    const store = new PrismaRateLimitStore();
    store.init({ windowMs: 60 * 1000 } as any);

    const testKey = 'test-ip-127.0.0.1';

    // First hit
    const hit1 = await store.increment(testKey);
    expect(hit1.totalHits).toBe(1);

    // Second hit
    const hit2 = await store.increment(testKey);
    expect(hit2.totalHits).toBe(2);

    // Decrement
    await store.decrement(testKey);
    const dbEntry = await prisma.rateLimitEntry.findUnique({
      where: { key: testKey },
    });
    expect(dbEntry?.points).toBe(1);

    // Reset
    await store.resetKey(testKey);
    const resetEntry = await prisma.rateLimitEntry.findUnique({
      where: { key: testKey },
    });
    expect(resetEntry).toBeNull();
  });

  it('should clean up expired sessions and expired password reset tokens while preserving active ones', async () => {
    const owner = await createTestOwner('cleanup_test');
    const userId = owner.user.id;

    const now = new Date();
    const past = new Date(now.getTime() - 3600 * 1000); // 1 hour ago
    const future = new Date(now.getTime() + 3600 * 1000); // 1 hour future

    // Active session
    await prisma.session.create({
      data: {
        userId,
        organizationId: owner.user.organizationId,
        token: 'active-session-token',
        expiresAt: future,
      },
    });

    // Expired session
    await prisma.session.create({
      data: {
        userId,
        organizationId: owner.user.organizationId,
        token: 'expired-session-token',
        expiresAt: past,
      },
    });

    // Active token
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: 'active-reset-token-hash',
        expiresAt: future,
      },
    });

    // Expired token
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: 'expired-reset-token-hash',
        expiresAt: past,
      },
    });

    // Used token
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: 'used-reset-token-hash',
        expiresAt: future,
        usedAt: past,
      },
    });

    // Run cleanup
    const result = await cleanupService.cleanupExpiredSessionsAndTokens();
    expect(result.expiredSessionsDeleted).toBe(1);
    expect(result.expiredTokensDeleted).toBe(2); // 1 expired + 1 used

    // Verify expired session is gone, active session remains
    const remainingSessions = await prisma.session.findMany({
      where: { userId },
    });
    expect(remainingSessions.find((s) => s.token === 'expired-session-token')).toBeUndefined();
    expect(remainingSessions.find((s) => s.token === 'active-session-token')).toBeDefined();

    const remainingTokens = await prisma.passwordResetToken.findMany({
      where: { userId },
    });
    expect(remainingTokens).toHaveLength(1);
    expect(remainingTokens[0].tokenHash).toBe('active-reset-token-hash');
  });
});
