import { prisma, EmailJobStatus } from '../database/index.js';
import { config } from '../config/index.js';

export interface EnqueueEmailParams {
  recipient: string;
  subject: string;
  payload: Record<string, any>;
  maxAttempts?: number;
}

export class EmailOutboxService {
  async enqueueEmail(params: EnqueueEmailParams): Promise<string> {
    const job = await prisma.emailOutbox.create({
      data: {
        recipient: params.recipient,
        subject: params.subject,
        payload: params.payload,
        maxAttempts: params.maxAttempts || 3,
        status: EmailJobStatus.PENDING,
        nextAttemptAt: new Date(),
      },
    });

    // In dev or test, trigger immediate delivery attempt
    if (config.nodeEnv !== 'production') {
      await this.processJob(job.id);
    }

    return job.id;
  }

  async processJob(jobId: string): Promise<boolean> {
    const job = await prisma.emailOutbox.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status === EmailJobStatus.SENT) {
      return false;
    }

    try {
      // Simulate real delivery or SMTP send
      console.log(`[EMAIL DISPATCH] To: ${job.recipient} | Subject: ${job.subject} | Token: ${(job.payload as any)?.token || 'N/A'}`);

      await prisma.emailOutbox.update({
        where: { id: jobId },
        data: {
          status: EmailJobStatus.SENT,
          sentAt: new Date(),
          attempts: { increment: 1 },
        },
      });

      return true;
    } catch (err: any) {
      const nextAttemptNumber = job.attempts + 1;
      const hasReachedMax = nextAttemptNumber >= job.maxAttempts;

      // Exponential backoff: 2^attempts * 5 seconds
      const backoffMs = Math.pow(2, nextAttemptNumber) * 5000;
      const nextAttemptAt = new Date(Date.now() + backoffMs);

      await prisma.emailOutbox.update({
        where: { id: jobId },
        data: {
          attempts: { increment: 1 },
          lastError: err?.message || 'Unknown email dispatch error',
          status: hasReachedMax ? EmailJobStatus.FAILED : EmailJobStatus.PENDING,
          nextAttemptAt,
        },
      });

      return false;
    }
  }

  async processPendingQueue(batchSize: number = 20): Promise<number> {
    const pendingJobs = await prisma.emailOutbox.findMany({
      where: {
        status: EmailJobStatus.PENDING,
        nextAttemptAt: { lte: new Date() },
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    let successCount = 0;
    for (const job of pendingJobs) {
      const ok = await this.processJob(job.id);
      if (ok) successCount++;
    }

    return successCount;
  }
}

export const emailOutboxService = new EmailOutboxService();
