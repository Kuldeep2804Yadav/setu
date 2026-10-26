import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';
import { prisma, Role } from '../src/database/index.js';
import argon2 from 'argon2';

describe('Attendance Submission & Approval Workflow', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  // Helper to create accountant or supervisor in the same org
  async function createOrgMember(orgId: string, email: string, role: Role) {
    const passwordHash = await argon2.hash('Member@123', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email,
        name: `Member ${role}`,
        role,
        passwordHash,
      },
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Member@123' });

    return {
      user,
      cookie: loginRes.headers['set-cookie'],
    };
  }

  it('should prevent self-approval while allowing cross-role approval between Owner and Accountant', async () => {
    const owner = await createTestOwner('self_approve_test');
    const accountant = await createOrgMember(owner.user.organizationId, 'accountant@test.com', Role.ACCOUNTANT);

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Commercial Complex', code: 'SITE-CCX' });
    const siteId = siteRes.body.data.id;

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Gopal Verma',
        trade: 'Mason',
        initialSiteId: siteId,
        initialWage: { wageType: 'DAILY', rate: 600 },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-10';
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.wageRate.updateMany({
      where: { workerId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });

    // 1. Owner creates submission and submits it
    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const submissionId = subRes.body.data.id;

    await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'PRESENT' }],
      });

    const submitRes = await request(app)
      .post(`/api/v1/attendance/submissions/${submissionId}/submit`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('SUBMITTED');
    expect(submitRes.body.data.submittedByUser.id).toBe(owner.user.id);

    // 2. SELF-APPROVAL ATTEMPT: Owner attempts to approve their OWN submission -> MUST BE FORBIDDEN (403)
    const selfApproveRes = await request(app)
      .post(`/api/v1/attendance/submissions/${submissionId}/approve`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.code).toBe('CANNOT_APPROVE_OWN_SUBMISSION');

    // 3. CROSS-ROLE APPROVAL: Accountant approves Owner's submission -> SUCCESS (200)
    const accountantApproveRes = await request(app)
      .post(`/api/v1/attendance/submissions/${submissionId}/approve`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(accountantApproveRes.status).toBe(200);
    expect(accountantApproveRes.body.data.status).toBe('APPROVED');
    expect(accountantApproveRes.body.data.approvedByUser.id).toBe(accountant.user.id);
  });

  it('should enforce supervisor site restriction: supervisors can only draft/submit for assigned sites', async () => {
    const owner = await createTestOwner('supervisor_scope_test');
    const supervisor = await createOrgMember(owner.user.organizationId, 'supervisor@test.com', Role.SUPERVISOR);

    const site1Res = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Assigned Site', code: 'SITE-ASG' });
    const assignedSiteId = site1Res.body.data.id;

    const site2Res = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Unassigned Site', code: 'SITE-UNA' });
    const unassignedSiteId = site2Res.body.data.id;

    // Assign supervisor to site1 only
    await prisma.supervisorSite.create({
      data: {
        userId: supervisor.user.id,
        siteId: assignedSiteId,
      },
    });

    const testDate = '2026-01-12';

    // 1. Supervisor accesses unassigned site -> FORBIDDEN (403)
    const unassignedRoster = await request(app)
      .get(`/api/v1/attendance/roster/${unassignedSiteId}?date=${testDate}`)
      .set('Cookie', supervisor.cookie);
    expect(unassignedRoster.status).toBe(403);

    const unassignedSub = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', supervisor.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId: unassignedSiteId, attendanceDate: testDate });
    expect(unassignedSub.status).toBe(403);

    // 2. Supervisor accesses assigned site -> SUCCESS (200)
    const assignedRoster = await request(app)
      .get(`/api/v1/attendance/roster/${assignedSiteId}?date=${testDate}`)
      .set('Cookie', supervisor.cookie);
    expect(assignedRoster.status).toBe(200);

    const assignedSub = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', supervisor.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId: assignedSiteId, attendanceDate: testDate });
    expect(assignedSub.status).toBe(200);
  });

  it('should support rejection with reason and return submission to editable draft', async () => {
    const owner = await createTestOwner('reject_cycle_test');
    const accountant = await createOrgMember(owner.user.organizationId, 'acc_reject@test.com', Role.ACCOUNTANT);

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Flyover Site', code: 'SITE-FLY' });
    const siteId = siteRes.body.data.id;

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Dinesh Painter',
        trade: 'Painter',
        initialSiteId: siteId,
        initialWage: { wageType: 'DAILY', rate: 550 },
      });
    const workerId = workerRes.body.data.id;

    const testDate = '2026-01-14';
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });
    await prisma.wageRate.updateMany({
      where: { workerId },
      data: { effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    });

    // 1. Accountant creates draft and submits it
    const subRes = await request(app)
      .post('/api/v1/attendance/submissions')
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ siteId, attendanceDate: testDate });
    const submissionId = subRes.body.data.id;

    await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'HALF_DAY' }],
      });

    await request(app)
      .post(`/api/v1/attendance/submissions/${submissionId}/submit`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    // 2. Submission is frozen while SUBMITTED -> Edits should be rejected
    const freezeRes = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'PRESENT' }],
      });
    expect(freezeRes.status).toBe(400);
    expect(freezeRes.body.error.code).toBe('SUBMISSION_FROZEN');

    // 3. Owner rejects submission with reason
    const rejectRes = await request(app)
      .post(`/api/v1/attendance/submissions/${submissionId}/reject`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ reason: 'Worker was present full day, please correct half-day entry.' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');
    expect(rejectRes.body.data.rejectionReason).toContain('correct half-day entry');

    // 4. Saving edits on rejected submission returns it to DRAFT with updated status
    const editRes = await request(app)
      .put(`/api/v1/attendance/submissions/${submissionId}/draft`)
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        entries: [{ workerId, status: 'PRESENT' }],
      });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.status).toBe('DRAFT');
    const updatedEntry = editRes.body.data.attendances.find((a: any) => a.workerId === workerId);
    expect(updatedEntry.status).toBe('PRESENT');
    expect(updatedEntry.payableUnits).toBe(1.0);
  });
});
