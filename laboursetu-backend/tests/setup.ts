import { beforeAll, afterAll } from 'vitest';

// Force test environment
process.env.NODE_ENV = 'test';
// The Vitest configuration validates TEST_DATABASE_URL before modules load.

import { prisma } from '../src/database/index.js';

export async function clearDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.rateLimitEntry.deleteMany();
  await prisma.emailOutbox.deleteMany();
  await prisma.wageEntry.deleteMany();
  await prisma.attendanceCorrection.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.attendanceSubmission.deleteMany();
  await prisma.wageRate.deleteMany();
  await prisma.workerSiteAssignment.deleteMany();
  await prisma.supervisorSite.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.site.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

beforeAll(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
