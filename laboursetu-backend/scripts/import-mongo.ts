import { prisma } from '../src/database/index.js';
import fs from 'fs';

function toDate(val: any): Date | undefined | null {
  if (val === null || val === undefined) return val;
  return new Date(val);
}

function toFloat(val: any): number | undefined | null {
  if (val === null || val === undefined) return val;
  return parseFloat(val);
}

async function importAll() {
  const raw = fs.readFileSync('pg_backup_data.json', 'utf8');
  const data = JSON.parse(raw);

  console.log('🔄 Starting data import to MongoDB Atlas...');

  // 1. Organizations
  for (const org of data.organizations) {
    await prisma.organization.upsert({
      where: { id: org.id },
      create: {
        ...org,
        createdAt: toDate(org.createdAt)!,
        updatedAt: toDate(org.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ Organizations: ${data.organizations.length}`);

  // 2. Users
  for (const user of data.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        ...user,
        createdAt: toDate(user.createdAt)!,
        updatedAt: toDate(user.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ Users: ${data.users.length}`);

  // 3. Sites
  for (const site of data.sites) {
    await prisma.site.upsert({
      where: { id: site.id },
      create: {
        ...site,
        archivedAt: toDate(site.archivedAt),
        createdAt: toDate(site.createdAt)!,
        updatedAt: toDate(site.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ Sites: ${data.sites.length}`);

  // 4. Supervisor Sites
  for (const ss of data.supervisorSites) {
    await prisma.supervisorSite.upsert({
      where: { id: ss.id },
      create: {
        ...ss,
        assignedAt: toDate(ss.assignedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ SupervisorSites: ${data.supervisorSites.length}`);

  // 5. Workers
  for (const worker of data.workers) {
    await prisma.worker.upsert({
      where: { id: worker.id },
      create: {
        ...worker,
        archivedAt: toDate(worker.archivedAt),
        createdAt: toDate(worker.createdAt)!,
        updatedAt: toDate(worker.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ Workers: ${data.workers.length}`);

  // 6. WorkerSiteAssignments
  for (const wsa of data.workerSiteAssignments) {
    await prisma.workerSiteAssignment.upsert({
      where: { id: wsa.id },
      create: {
        ...wsa,
        startDate: toDate(wsa.startDate)!,
        endDate: toDate(wsa.endDate),
        createdAt: toDate(wsa.createdAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ WorkerSiteAssignments: ${data.workerSiteAssignments.length}`);

  // 7. WageRates
  for (const wr of data.wageRates) {
    await prisma.wageRate.upsert({
      where: { id: wr.id },
      create: {
        ...wr,
        rate: toFloat(wr.rate)!,
        effectiveFrom: toDate(wr.effectiveFrom)!,
        effectiveTo: toDate(wr.effectiveTo),
        createdAt: toDate(wr.createdAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ WageRates: ${data.wageRates.length}`);

  // 8. AttendanceSubmissions
  for (const sub of data.attendanceSubmissions) {
    await prisma.attendanceSubmission.upsert({
      where: { id: sub.id },
      create: {
        ...sub,
        attendanceDate: toDate(sub.attendanceDate)!,
        submittedAt: toDate(sub.submittedAt),
        approvedAt: toDate(sub.approvedAt),
        rejectedAt: toDate(sub.rejectedAt),
        createdAt: toDate(sub.createdAt)!,
        updatedAt: toDate(sub.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ AttendanceSubmissions: ${data.attendanceSubmissions.length}`);

  // 9. Attendances
  for (const att of data.attendances) {
    await prisma.attendance.upsert({
      where: { id: att.id },
      create: {
        ...att,
        attendanceDate: toDate(att.attendanceDate)!,
        hoursWorked: toFloat(att.hoursWorked),
        payableUnits: toFloat(att.payableUnits)!,
        createdAt: toDate(att.createdAt)!,
        updatedAt: toDate(att.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ Attendances: ${data.attendances.length}`);

  // 10. WageEntries
  for (const we of data.wageEntries) {
    await prisma.wageEntry.upsert({
      where: { id: we.id },
      create: {
        ...we,
        attendanceDate: toDate(we.attendanceDate)!,
        rate: toFloat(we.rate)!,
        payableUnits: toFloat(we.payableUnits)!,
        hoursWorked: toFloat(we.hoursWorked),
        grossWage: toFloat(we.grossWage)!,
        approvedAt: toDate(we.approvedAt)!,
        createdAt: toDate(we.createdAt)!,
        updatedAt: toDate(we.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ WageEntries: ${data.wageEntries.length}`);

  // 11. AttendanceCorrections
  for (const ac of data.attendanceCorrections) {
    await prisma.attendanceCorrection.upsert({
      where: { id: ac.id },
      create: {
        ...ac,
        previousHoursWorked: toFloat(ac.previousHoursWorked),
        previousPayableUnits: toFloat(ac.previousPayableUnits)!,
        previousWageAmount: toFloat(ac.previousWageAmount)!,
        newHoursWorked: toFloat(ac.newHoursWorked),
        newPayableUnits: toFloat(ac.newPayableUnits)!,
        newWageAmount: toFloat(ac.newWageAmount)!,
        requestedAt: toDate(ac.requestedAt)!,
        reviewedAt: toDate(ac.reviewedAt),
        createdAt: toDate(ac.createdAt)!,
        updatedAt: toDate(ac.updatedAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ AttendanceCorrections: ${data.attendanceCorrections.length}`);

  // 12. AuditLogs
  for (const al of data.auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: al.id },
      create: {
        ...al,
        createdAt: toDate(al.createdAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ AuditLogs: ${data.auditLogs.length}`);

  // 13. Sessions
  for (const sess of data.sessions) {
    await prisma.session.upsert({
      where: { id: sess.id },
      create: {
        ...sess,
        expiresAt: toDate(sess.expiresAt)!,
        createdAt: toDate(sess.createdAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ Sessions: ${data.sessions.length}`);

  // 14. RateLimitEntries
  for (const rle of data.rateLimitEntries) {
    await prisma.rateLimitEntry.upsert({
      where: { key: rle.key },
      create: {
        ...rle,
        expireAt: toDate(rle.expireAt)!,
      },
      update: {},
    });
  }
  console.log(`✅ RateLimitEntries: ${data.rateLimitEntries.length}`);

  console.log('🎉 ALL DATA MIGRATED TO MONGODB ATLAS SUCCESSFULLY!');
  await prisma.$disconnect();
}

importAll().catch((e) => {
  console.error('Import error:', e);
  process.exit(1);
});
