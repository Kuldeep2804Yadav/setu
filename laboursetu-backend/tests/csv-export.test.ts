import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';
import { prisma, Role } from '../src/database/index.js';
import argon2 from 'argon2';

describe('Wage Register CSV Export & Formula Injection Defense', () => {
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

  it('should export CSV with proper headers and sanitize formula injection characters (CWE-1236)', async () => {
    const owner = await createTestOwner('csv_export_owner');
    const accountant = await createAccountant(owner.user.organizationId, 'csv_acc@test.com');

    // Create a site with potential formula injection name: "=cmd|' /C calc'!A0"
    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: '=cmd| /C calc',
        code: 'SITE-INJ',
      });
    const siteId = siteRes.body.data.id;

    // Create a worker with potential formula injection in name: "+SUM(1,2)"
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: '+SUM(1,2)',
        trade: '@AdminTrade',
        initialSiteId: siteId,
        initialWage: { wageType: 'DAILY', rate: 750 },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-25';
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.wageRate.updateMany({
      where: { workerId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });

    // Create, submit, approve attendance
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
        entries: [{ workerId, status: 'PRESENT' }],
      });

    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/submit`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    await request(app)
      .post(`/api/v1/attendance/submissions/${subId}/approve`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    // Request CSV export
    const exportRes = await request(app)
      .get(`/api/v1/wages/register/export?startDate=${testDate}&endDate=${testDate}`)
      .set('Cookie', owner.cookie);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');
    expect(exportRes.headers['content-disposition']).toContain('attachment; filename="wage-register-');

    const csvText = exportRes.text;

    // Check header line exists
    expect(csvText).toContain('Attendance Date,Worker Code,Worker Name,Trade,Site Code,Site Name');

    // FORMULA INJECTION VERIFICATION:
    // Any cell string starting with =, +, -, @ must be prefixed with a single quote (')
    // "=cmd| /C calc" must be exported as "'=cmd| /C calc"
    expect(csvText).toContain("'=cmd| /C calc");
    // "+SUM(1,2)" must be exported as "'+SUM(1,2)"
    expect(csvText).toContain("'+SUM(1,2)");
    // "@AdminTrade" must be exported as "'@AdminTrade"
    expect(csvText).toContain("'@AdminTrade");

    // Earned wage must be present
    expect(csvText).toContain('750.00');
  });
});
