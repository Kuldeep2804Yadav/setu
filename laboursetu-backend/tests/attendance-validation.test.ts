import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';
import { prisma, WageType } from '../src/database/index.js';

describe('Attendance Validation & Constraints', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should reject future attendance dates based on Asia/Kolkata', async () => {
    const owner = await createTestOwner('att_val_future');

    // Create Site
    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Future Site', code: 'SITE-FUT' });
    const siteId = siteRes.body.data.id;

    // A date guaranteed to be in the future (year 2099)
    const futureDate = '2099-01-01';

    // Roster query with future date should be rejected with 400
    const rosterRes = await request(app)
      .get(`/api/v1/attendance/roster/${siteId}?date=${futureDate}`)
      .set('Cookie', owner.cookie);
    expect(rosterRes.status).toBe(400);
    expect(rosterRes.body.error.code).toBe('FUTURE_DATE_NOT_ALLOWED');

    // Creating submission with future date should be rejected with 400
    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: futureDate });
    expect(subRes.status).toBe(400);
    expect(subRes.body.error.code).toBe('FUTURE_DATE_NOT_ALLOWED');
  });

  it('should validate DAILY workers: PRESENT, HALF_DAY, ABSENT and reject arbitrary hoursWorked', async () => {
    const owner = await createTestOwner('att_val_daily');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Metro Site', code: 'SITE-MTR' });
    const siteId = siteRes.body.data.id;

    // Create worker with DAILY wage rate
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Ramesh Carpenter',
        trade: 'Carpenter',
        initialSiteId: siteId,
        initialWage: {
          wageType: 'DAILY',
          rate: 650,
        },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-15';
    // Backdate assignment to include 2026-01-15
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    // Backdate wage rate to include 2026-01-15
    await prisma.wageRate.updateMany({
      where: { workerId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });

    // Create submission draft
    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const submissionId = subRes.body.data.id;

    // 1. Valid DAILY PRESENT without hoursWorked -> Allowed
    const saveRes1 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'PRESENT', notes: 'Full day work' },
        ],
      });
    expect(saveRes1.status).toBe(200);
    const entry1 = saveRes1.body.data.attendances.find((a: any) => a.workerId === workerId);
    expect(entry1.status).toBe('PRESENT');
    expect(entry1.payableUnits).toBe(1.0);
    expect(entry1.calculatedWage).toBe(650);

    // 2. Valid DAILY HALF_DAY -> Allowed (0.5 payable units, 325 gross wage)
    const saveRes2 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'HALF_DAY', notes: 'Morning only' },
        ],
      });
    expect(saveRes2.status).toBe(200);
    const entry2 = saveRes2.body.data.attendances.find((a: any) => a.workerId === workerId);
    expect(entry2.status).toBe('HALF_DAY');
    expect(entry2.payableUnits).toBe(0.5);
    expect(entry2.calculatedWage).toBe(325);

    // 3. Valid DAILY ABSENT -> Allowed (0 payable units, 0 gross wage)
    const saveRes3 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'ABSENT', notes: 'Sick leave' },
        ],
      });
    expect(saveRes3.status).toBe(200);
    const entry3 = saveRes3.body.data.attendances.find((a: any) => a.workerId === workerId);
    expect(entry3.status).toBe('ABSENT');
    expect(entry3.payableUnits).toBe(0);
    expect(entry3.calculatedWage).toBe(0);

    // 4. Invalid: Arbitrary hoursWorked passed for DAILY worker -> Rejected with 400
    const saveRes4 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'PRESENT', hoursWorked: 6.5 },
        ],
      });
    expect(saveRes4.status).toBe(400);
    expect(saveRes4.body.error.message).toContain('DAILY');
  });

  it('should validate HOURLY workers: valid hours, reject negative hours, hours > 24, hours > 2 decimals, or non-zero hours when ABSENT', async () => {
    const owner = await createTestOwner('att_val_hourly');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Highway Site', code: 'SITE-HWY' });
    const siteId = siteRes.body.data.id;

    // Create worker with HOURLY wage rate
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Suresh Welder',
        trade: 'Welder',
        initialSiteId: siteId,
        initialWage: {
          wageType: 'HOURLY',
          rate: 120,
        },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-16';
    // Backdate assignment to include 2026-01-16
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    // Backdate wage rate to include 2026-01-16
    await prisma.wageRate.updateMany({
      where: { workerId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });

    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const submissionId = subRes.body.data.id;

    // 1. Valid HOURLY PRESENT with 7.50 hours -> Allowed (7.5 * 120 = 900)
    const saveRes1 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'PRESENT', hoursWorked: 7.5 },
        ],
      });
    expect(saveRes1.status).toBe(200);
    const entry1 = saveRes1.body.data.attendances.find((a: any) => a.workerId === workerId);
    expect(entry1.status).toBe('PRESENT');
    expect(entry1.hoursWorked).toBe(7.5);
    expect(entry1.payableUnits).toBe(7.5);
    expect(entry1.calculatedWage).toBe(900);

    // 2. Invalid: HOURLY PRESENT without hoursWorked -> Rejected with 400
    const saveRes2 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'PRESENT' },
        ],
      });
    expect(saveRes2.status).toBe(400);

    // 3. Invalid: HOURLY HALF_DAY is not allowed for hourly workers -> Rejected with 400
    const saveRes3 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'HALF_DAY', hoursWorked: 4 },
        ],
      });
    expect(saveRes3.status).toBe(400);

    // 4. Invalid: Negative hours -> Rejected by Zod schema (400)
    const saveRes4 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'PRESENT', hoursWorked: -3 },
        ],
      });
    expect(saveRes4.status).toBe(400);

    // 5. Invalid: Hours > 24 -> Rejected by Zod schema (400)
    const saveRes5 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'PRESENT', hoursWorked: 24.5 },
        ],
      });
    expect(saveRes5.status).toBe(400);

    // 6. Invalid: Non-zero hours for ABSENT -> Rejected with 400
    const saveRes6 = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId, status: 'ABSENT', hoursWorked: 5 },
        ],
      });
    expect(saveRes6.status).toBe(400);
  });

  it('should enforce unique attendance per worker per date across all sites in an organization', async () => {
    const owner = await createTestOwner('att_unique_cross_site');

    // Create Site A and Site B
    const siteARes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Site Alpha', code: 'SITE-ALP' });
    const siteAId = siteARes.body.data.id;

    const siteBRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Site Beta', code: 'SITE-BET' });
    const siteBId = siteBRes.body.data.id;

    // Create worker assigned to Site A
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Vikas Sharma',
        trade: 'Electrician',
        initialSiteId: siteAId,
        initialWage: {
          wageType: 'DAILY',
          rate: 700,
        },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-20';
    // Give worker active assignments at both sites for this test
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.workerSiteAssignment.create({
      data: {
        workerId,
        siteId: siteBId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
      },
    });

    // 1. Record attendance for worker at Site A on 2026-01-20
    const subARes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId: siteAId, attendanceDate: testDate });
    const subAId = subARes.body.data.id;

    const saveARes = await request(app)
      .put(`/api/v1/attendance/submissions/${subAId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'PRESENT' }],
      });
    expect(saveARes.status).toBe(200);

    // 2. Try to record attendance for the SAME worker on the SAME date at Site B
    const subBRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId: siteBId, attendanceDate: testDate });
    const subBId = subBRes.body.data.id;

    const saveBRes = await request(app)
      .put(`/api/v1/attendance/submissions/${subBId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'PRESENT' }],
      });

    // Expect 409 Conflict with DUPLICATE_ATTENDANCE
    expect(saveBRes.status).toBe(409);
    expect(saveBRes.body.error.code).toBe('DUPLICATE_ATTENDANCE');
    expect(saveBRes.body.error.message).toContain('Site Alpha');
  });
});
