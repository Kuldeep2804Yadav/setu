import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner, createTeamMember } from './helpers.js';
import { Role } from '../src/shared/index.js';

describe('Role-Based Access Control (RBAC)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should enforce role restrictions between OWNER, ACCOUNTANT, and SUPERVISOR', async () => {
    // 1. Setup Organization with Owner, Accountant, and Supervisor
    const owner = await createTestOwner('rbac');
    const accountant = await createTeamMember(owner, Role.ACCOUNTANT, 'acct');
    const supervisor = await createTeamMember(owner, Role.SUPERVISOR, 'sup');

    // 2. OWNER can create Site
    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'RBAC Site One',
        code: 'SITE-RBAC-1',
      });
    expect(siteRes.status).toBe(201);
    const siteId = siteRes.body.data.id;

    // 3. ACCOUNTANT can create Site and Worker
    const accountantSiteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Accountant Site',
        code: 'SITE-ACCT',
      });
    expect(accountantSiteRes.status).toBe(201);

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', accountant.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Ramesh Yadav',
        mobileNumber: '9812341234',
        trade: 'Mason',
      });
    expect(workerRes.status).toBe(201);
    const workerId = workerRes.body.data.id;

    // 4. SUPERVISOR CANNOT create Site -> 403
    const supCreateSiteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', supervisor.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Unauthorized Site',
        code: 'SITE-UNAUTH',
      });
    expect(supCreateSiteRes.status).toBe(403);
    expect(supCreateSiteRes.body.error.code).toBe('FORBIDDEN');

    // 5. SUPERVISOR CANNOT create Worker -> 403
    const supCreateWorkerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', supervisor.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Unauthorized Worker',
        trade: 'Helper',
      });
    expect(supCreateWorkerRes.status).toBe(403);

    // 6. SUPERVISOR CANNOT add Wage Rate -> 403
    const supWageRes = await request(app)
      .post(`/api/v1/workers/${workerId}/wage-rates`)
      .set('Cookie', supervisor.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        wageType: 'DAILY',
        rate: 800,
        effectiveFrom: new Date().toISOString(),
      });
    expect(supWageRes.status).toBe(403);

    // 7. SUPERVISOR CAN assign Worker to Site -> 200
    const supAssignRes = await request(app)
      .post(`/api/v1/workers/${workerId}/assign-site`)
      .set('Cookie', supervisor.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        siteId,
      });
    expect(supAssignRes.status).toBe(200);

    // 8. SUPERVISOR CANNOT invite team members -> 403
    const supInviteRes = await request(app)
      .post('/api/v1/organization/team')
      .set('Cookie', supervisor.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Illegal Member',
        email: 'illegal@test.com',
        password: 'Password123!',
        role: 'SUPERVISOR',
      });
    expect(supInviteRes.status).toBe(403);
  });
});
