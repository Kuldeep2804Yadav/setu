import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';
import { prisma, Role, WageType, WageEntryStatus } from '../src/database/index.js';
import argon2 from 'argon2';

describe('Wage Calculation & Snapshots', () => {
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

  it('should select latest rate on or before attendance date, calculate exact wages, and round half-up', async () => {
    const owner = await createTestOwner('wage_calc_rates');
    const accountant = await createAccountant(owner.user.organizationId, 'wage_acc@test.com');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Commercial Tower', code: 'SITE-TOW' });
    const siteId = siteRes.body.data.id;

    // Worker 1: Daily rate with multiple historical revisions
    // Join date 2026-01-01: Rate = 500
    // Revision on 2026-01-15: Rate = 600
    // Revision on 2026-02-01: Rate = 700
    const w1Res = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Mohan Lal',
        trade: 'Mason',
        initialSiteId: siteId,
        initialWage: {
          wageType: 'DAILY',
          rate: 500,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        },
      });
    const w1Id = w1Res.body.data.id;

    // Add revision on 2026-01-15: 600
    await prisma.wageRate.create({
      data: {
        workerId: w1Id,
        wageType: WageType.DAILY,
        rate: '600.00',
        effectiveFrom: new Date('2026-01-15T00:00:00.000Z'),
        createdByUserId: owner.user.id,
      },
    });

    // Add revision on 2026-02-01: 700
    await prisma.wageRate.create({
      data: {
        workerId: w1Id,
        wageType: WageType.DAILY,
        rate: '700.00',
        effectiveFrom: new Date('2026-02-01T00:00:00.000Z'),
        createdByUserId: owner.user.id,
      },
    });

    // Worker 2: Hourly rate with fractional arithmetic test
    // Rate = 133.35/hr, 7.5 hrs => 133.35 * 7.5 = 1000.125 => Round Half-Up => 1000.13
    const w2Res = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Arun Welder',
        trade: 'Welder',
        initialSiteId: siteId,
        initialWage: {
          wageType: 'HOURLY',
          rate: 133.35,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
        },
      });
    const w2Id = w2Res.body.data.id;

    // Ensure site assignments start from 2026-01-01
    await prisma.workerSiteAssignment.updateMany({
      where: { siteId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });

    // Attendance Date: 2026-01-20
    // For w1: Rate on 2026-01-15 (600) should be picked, NOT the 2026-02-01 (700) rate!
    const testDate = '2026-01-20';
    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const subId = subRes.body.data.id;

    await request(app)
      .put(`/api/v1/attendance/submissions/${subId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [
          { workerId: w1Id, status: 'HALF_DAY' }, // 600 * 0.5 = 300.00
          { workerId: w2Id, status: 'PRESENT', hoursWorked: 7.5 }, // 133.35 * 7.5 = 1000.13
        ],
      });

    // Submit attendance by Owner
    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/submit`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    // Approve by Accountant (separate user)
    const approveRes = await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/approve`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(approveRes.status).toBe(200);

    // Verify WageEntry snapshots in DB
    const wageEntries = await prisma.wageEntry.findMany({
      where: { attendance: { submissionId: subId } },
      orderBy: { workerId: 'asc' },
    });
    expect(wageEntries).toHaveLength(2);

    const w1Entry = wageEntries.find((e) => e.workerId === w1Id)!;
    expect(Number(w1Entry.rate)).toBe(600); // Picked 600, not 500 or 700
    expect(Number(w1Entry.payableUnits)).toBe(0.5);
    expect(Number(w1Entry.grossWage)).toBe(300.0);
    expect(w1Entry.status).toBe(WageEntryStatus.ACTIVE);

    const w2Entry = wageEntries.find((e) => e.workerId === w2Id)!;
    expect(Number(w2Entry.rate)).toBe(133.35);
    expect(Number(w2Entry.payableUnits)).toBe(7.5);
    expect(Number(w2Entry.hoursWorked)).toBe(7.5);
    // 133.35 * 7.5 = 1000.125 => rounded half-up to 1000.13
    expect(Number(w2Entry.grossWage)).toBe(1000.13);

    // 2. Immutability verification:
    // If a new wage rate of 999 is added later, or the worker name/profile is edited,
    // the approved wage entry MUST REMAIN 300.00 and 1000.13!
    await prisma.wageRate.create({
      data: {
        workerId: w1Id,
        wageType: WageType.DAILY,
        rate: '999.00',
        effectiveFrom: new Date('2026-03-01T00:00:00.000Z'),
        createdByUserId: owner.user.id,
      },
    });

    const w1EntryAfter = await prisma.wageEntry.findUnique({
      where: { id: w1Entry.id },
    });
    expect(Number(w1EntryAfter?.grossWage)).toBe(300.0);
    expect(Number(w1EntryAfter?.rate)).toBe(600);
  });

  it('should block approval if an eligible present worker has no effective wage rate', async () => {
    const owner = await createTestOwner('wage_missing_rate');
    const accountant = await createAccountant(owner.user.organizationId, 'acc_miss@test.com');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Bridge Work', code: 'SITE-BWK' });
    const siteId = siteRes.body.data.id;

    // Worker created WITHOUT initial wage rate
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Radhe Shyam',
        trade: 'Helper',
        initialSiteId: siteId,
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-18';
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });

    // Create draft submission and enter PRESENT
    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const subId = subRes.body.data.id;

    await request(app)
      .put(`/api/v1/attendance/submissions/${subId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'PRESENT' }],
      });

    // Submit by Owner
    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/submit`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    // Attempt to approve by Accountant -> Should be BLOCKED with 400 MISSING_WAGE_RATE
    const approveRes = await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/approve`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(approveRes.status).toBe(400);
    expect(approveRes.body.error.code).toBe('MISSING_WAGE_RATE');
    expect(approveRes.body.error.message).toContain('Radhe Shyam');
  });

  it('should be idempotent on approval retries without creating duplicate wage entries', async () => {
    const owner = await createTestOwner('wage_idempotency');
    const accountant = await createAccountant(owner.user.organizationId, 'acc_idem@test.com');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Subway Site', code: 'SITE-SUB' });
    const siteId = siteRes.body.data.id;

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Kamal Hassan',
        trade: 'Plumber',
        initialSiteId: siteId,
        initialWage: { wageType: 'DAILY', rate: 750 },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-19';
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
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const subId = subRes.body.data.id;

    await request(app)
      .put(`/api/v1/attendance/submissions/${subId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'PRESENT' }],
      });

    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/submit`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    // First approval
    const approve1 = await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/approve`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(approve1.status).toBe(200);

    const count1 = await prisma.wageEntry.count({
      where: { workerId },
    });
    expect(count1).toBe(1);

    // Second approval retry
    const approve2 = await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/approve`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(approve2.status).toBe(200);

    const count2 = await prisma.wageEntry.count({
      where: { workerId },
    });
    // Count remains exactly 1, no duplicate entries created
    expect(count2).toBe(1);
  });
});
