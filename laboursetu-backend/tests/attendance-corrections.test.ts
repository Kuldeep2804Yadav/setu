import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';
import { prisma, Role, WageEntryStatus, CorrectionStatus } from '../src/database/index.js';
import argon2 from 'argon2';

describe('Attendance Corrections & Wage Superseding', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  async function createAccountant(orgId: string, email: string) {
    const passwordHash = await argon2.hash('Accountant@123', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        name: 'Accountant User',
        role: Role.ACCOUNTANT,
        passwordHash,
      },
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Accountant@123' });

    return {
      user,
      cookie: loginRes.headers['set-cookie'],
    };
  }

  it('should manage correction workflow, enforce different-user approval, and supersede wage entries without double counting', async () => {
    const owner = await createTestOwner('corr_supersede_test');
    const accountant = await createAccountant(owner.user.organizationId, 'corr_acc@test.com');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Plaza Project', code: 'SITE-PLZ' });
    const siteId = siteRes.body.data.id;

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Satish Painter',
        trade: 'Painter',
        initialSiteId: siteId,
        initialWage: { wageType: 'DAILY', rate: 800 },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-22';
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.wageRate.updateMany({
      where: { workerId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });

    // 1. Initial submission with HALF_DAY (400 earned wage) submitted by Accountant, approved by Owner
    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const subId = subRes.body.data.id;

    await request(app)
      .put(`/api/v1/attendance/submissions/${subId}/draft`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'HALF_DAY' }],
      });

    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/submit`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/approve`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    const attendanceRecord = await prisma.attendance.findFirst({
      where: { workerId, attendanceDate: new Date('2026-01-22T00:00:00.000Z') },
    });
    expect(attendanceRecord).toBeDefined();
    const attendanceId = attendanceRecord!.id;

    // Check initial wage register: 400.00
    const initialRegister = await request(app)
      .get(`/api/v1/wages/register?startDate=${testDate}&endDate=${testDate}`)
      .set('Cookie', owner.cookie);
    expect(initialRegister.status).toBe(200);
    expect(initialRegister.body.data.totals.totalGrossWage).toBe(400);

    // 2. Request Correction: Accountant requests correction to PRESENT (800)
    const corrReqRes = await request(app)
      .post(`/api/v1/attendance/records/${attendanceId}/corrections`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        newStatus: 'PRESENT',
        reason: 'Worker actually worked full shift after biometric/gate pass audit.',
      });
    expect(corrReqRes.status).toBe(201);
    const correctionId = corrReqRes.body.data.id;
    expect(corrReqRes.body.data.status).toBe('PENDING');

    // 3. Different-user review enforcement: Requester (Accountant) cannot approve their own correction
    const selfReviewRes = await request(app)
      .post(`/api/v1/attendance/corrections/${correctionId}/review`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ action: 'APPROVE', reviewNotes: 'Self approving' });
    expect(selfReviewRes.status).toBe(403);
    expect(selfReviewRes.body.error.code).toBe('CANNOT_APPROVE_OWN_CORRECTION');

    // 4. Owner reviews and APPROVES correction
    const approveCorrRes = await request(app)
      .post(`/api/v1/attendance/corrections/${correctionId}/review`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ action: 'APPROVE', reviewNotes: 'Verified with security gate register.' });
    expect(approveCorrRes.status).toBe(200);
    expect(approveCorrRes.body.data.status).toBe('APPROVED');

    // 5. Verify database state:
    // - Original wage entry marked SUPERSEDED
    const wageEntries = await prisma.wageEntry.findMany({
      where: { attendanceId },
      orderBy: { createdAt: 'asc' },
    });
    expect(wageEntries).toHaveLength(2);

    const [originalEntry, replacementEntry] = wageEntries;
    expect(originalEntry.status).toBe(WageEntryStatus.SUPERSEDED);
    expect(Number(originalEntry.grossWage)).toBe(400);

    expect(replacementEntry.status).toBe(WageEntryStatus.ACTIVE);
    expect(Number(replacementEntry.grossWage)).toBe(800);

    // - Attendance record updated
    const updatedAttendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    });
    expect(updatedAttendance?.status).toBe('PRESENT');
    expect(updatedAttendance?.isCorrected).toBe(true);

    // 6. Wage Register anti-double counting check:
    // Register should only sum ACTIVE entries, meaning total should be 800, NOT 1200!
    const updatedRegister = await request(app)
      .get(`/api/v1/wages/register?startDate=${testDate}&endDate=${testDate}`)
      .set('Cookie', owner.cookie);
    expect(updatedRegister.status).toBe(200);
    expect(updatedRegister.body.data.totals.totalGrossWage).toBe(800);
    expect(updatedRegister.body.data.entries).toHaveLength(1);
    expect(updatedRegister.body.data.entries[0].grossWage).toBe(800);
  });

  it('should support rejection of correction request leaving active wage entry intact', async () => {
    const owner = await createTestOwner('corr_reject_test');
    const accountant = await createAccountant(owner.user.organizationId, 'corr_acc_rej@test.com');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Hospital Block', code: 'SITE-HOS' });
    const siteId = siteRes.body.data.id;

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Naveen Electrician',
        trade: 'Electrician',
        initialSiteId: siteId,
        initialWage: { wageType: 'DAILY', rate: 700 },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-23';
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.wageRate.updateMany({
      where: { workerId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });

    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const subId = subRes.body.data.id;

    await request(app)
      .put(`/api/v1/attendance/submissions/${subId}/draft`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'HALF_DAY' }],
      });

    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/submit`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/approve`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    const attendanceRecord = await prisma.attendance.findFirst({
      where: { workerId, attendanceDate: new Date('2026-01-23T00:00:00.000Z') },
    });
    const attendanceId = attendanceRecord!.id;

    // Accountant requests correction
    const corrReqRes = await request(app)
      .post(`/api/v1/attendance/records/${attendanceId}/corrections`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        newStatus: 'PRESENT',
        reason: 'Worker claims full day',
      });
    const correctionId = corrReqRes.body.data.id;

    // Owner REJECTS correction
    const rejectRes = await request(app)
      .post(`/api/v1/attendance/corrections/${correctionId}/review`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        action: 'REJECT',
        reviewNotes: 'Worker left early at 1:30 PM as verified by site CCTV.',
      });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');

    // Wage entries remain 1 ACTIVE entry for 350.00
    const activeEntries = await prisma.wageEntry.findMany({
      where: { attendanceId, status: WageEntryStatus.ACTIVE },
    });
    expect(activeEntries).toHaveLength(1);
    expect(Number(activeEntries[0].grossWage)).toBe(350);

    const att = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    });
    expect(att?.isCorrected).toBe(false);
    expect(att?.status).toBe('HALF_DAY');
  });
});
