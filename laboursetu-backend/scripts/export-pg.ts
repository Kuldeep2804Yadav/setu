import { prisma } from '../src/database/index.js';
import fs from 'fs';

async function exportAll() {
  const data: Record<string, any> = {};
  data.organizations = await prisma.organization.findMany();
  data.users = await prisma.user.findMany();
  data.sites = await prisma.site.findMany();
  data.supervisorSites = await prisma.supervisorSite.findMany();
  data.workers = await prisma.worker.findMany();
  data.workerSiteAssignments = await prisma.workerSiteAssignment.findMany();
  data.wageRates = await prisma.wageRate.findMany();
  data.attendanceSubmissions = await prisma.attendanceSubmission.findMany();
  data.attendances = await prisma.attendance.findMany();
  data.attendanceCorrections = await prisma.attendanceCorrection.findMany();
  data.wageEntries = await prisma.wageEntry.findMany();
  data.auditLogs = await prisma.auditLog.findMany();
  data.sessions = await prisma.session.findMany();
  data.rateLimitEntries = await prisma.rateLimitEntry.findMany();
  data.passwordResetTokens = await prisma.passwordResetToken.findMany();
  data.emailOutbox = await prisma.emailOutbox.findMany();

  fs.writeFileSync('pg_backup_data.json', JSON.stringify(data, null, 2));
  console.log('✅ Exported PostgreSQL data successfully to pg_backup_data.json:');
  for (const [k, v] of Object.entries(data)) {
    console.log(`  - ${k}: ${v.length} rows`);
  }
  await prisma.$disconnect();
}

exportAll().catch((e) => {
  console.error('Export error:', e);
  process.exit(1);
});
