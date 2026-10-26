import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';

describe('Worker Management, Wage Rates & Duplicate Prevention', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should create worker with auto-generated code and initial wage rate', async () => {
    const owner = await createTestOwner('worker_suite');

    const res = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Manoj Kumar',
        mobileNumber: '9876500001',
        trade: 'Mason',
        initialWage: {
          wageType: 'DAILY',
          rate: 900.5,
          notes: 'Joining wage',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Manoj Kumar');
    expect(res.body.data.code).toMatch(/^WRK-\d{3}$/);
    expect(res.body.data.currentWage).toBeDefined();
    expect(res.body.data.currentWage.rate).toBe(900.5);
    expect(res.body.data.currentWage.wageType).toBe('DAILY');
  });

  it('should prevent ambiguous duplicate worker registration (same name + same phone) within the same organization', async () => {
    const owner = await createTestOwner('dup_suite');

    // Register first worker
    const firstRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Suresh Kumar',
        mobileNumber: '9876543210',
        trade: 'Mason',
      });
    expect(firstRes.status).toBe(201);

    // Register second worker with SAME name (even with different casing/spacing) and SAME mobile number
    const dupRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: '  suresh   kumar  ',
        mobileNumber: '9876543210',
        trade: 'Helper',
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.success).toBe(false);
    expect(dupRes.body.error.code).toBe('DUPLICATE_WORKER');
  });

  it('should ALLOW legitimate shared mobile numbers when worker names are different (e.g. family members)', async () => {
    const owner = await createTestOwner('shared_phone');

    // Husband
    const husbandRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Rameshwar Lal',
        mobileNumber: '9876543210',
        trade: 'Mason',
      });
    expect(husbandRes.status).toBe(201);

    // Wife sharing the same family phone
    const wifeRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Geeta Devi',
        mobileNumber: '9876543210',
        trade: 'Helper',
      });
    expect(wifeRes.status).toBe(201);
    expect(wifeRes.body.data.name).toBe('Geeta Devi');
    expect(wifeRes.body.data.mobileNumber).toBe('9876543210');
  });

  it('should maintain wage-rate history with effective dates', async () => {
    const owner = await createTestOwner('wage_history');

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Anil Verma',
        trade: 'Carpenter',
        initialWage: {
          wageType: 'DAILY',
          rate: 800,
          effectiveFrom: '2025-01-01',
          notes: 'Year 2025 rate',
        },
      });

    const workerId = workerRes.body.data.id;

    // Add new wage rate for 2026
    const newWageRes = await request(app)
      .post(`/api/v1/workers/${workerId}/wage-rates`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        wageType: 'DAILY',
        rate: 950,
        effectiveFrom: '2026-01-01',
        notes: 'Annual skill revision',
      });

    expect(newWageRes.status).toBe(201);
    expect(newWageRes.body.data.rate).toBe(950);

    // Fetch full worker details to inspect wage rate timeline
    const detailsRes = await request(app)
      .get(`/api/v1/workers/${workerId}`)
      .set('Cookie', owner.cookie);

    expect(detailsRes.status).toBe(200);
    const wageHistory = detailsRes.body.data.wageRateHistory;
    expect(wageHistory.length).toBe(2);

    // Newest rate is active (effectiveTo is null)
    expect(wageHistory[0].rate).toBe(950);
    expect(wageHistory[0].effectiveTo).toBeNull();

    // Prior rate had effectiveTo automatically set to the new rate's effectiveFrom
    expect(wageHistory[1].rate).toBe(800);
    expect(wageHistory[1].effectiveTo).toBeDefined();
    expect(wageHistory[1].effectiveTo.substring(0, 10)).toBe('2026-01-01');
  });

  it('should maintain site assignment history when reassigning worker', async () => {
    const owner = await createTestOwner('site_history');

    // Create Site 1 and Site 2
    const site1Res = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Site 1', code: 'SITE-01' });

    const site2Res = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Site 2', code: 'SITE-02' });

    // Create Worker with initial assignment to Site 1
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Deepak Jha',
        trade: 'Bar Bender',
        initialSiteId: site1Res.body.data.id,
      });

    const workerId = workerRes.body.data.id;

    // Reassign to Site 2
    const reassignRes = await request(app)
      .post(`/api/v1/workers/${workerId}/assign-site`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        siteId: site2Res.body.data.id,
        notes: 'Transferred for foundation reinforcement',
      });

    expect(reassignRes.status).toBe(200);

    // Check worker assignment history
    const detailsRes = await request(app)
      .get(`/api/v1/workers/${workerId}`)
      .set('Cookie', owner.cookie);

    const history = detailsRes.body.data.siteAssignmentHistory;
    expect(history.length).toBe(2);

    const activeAssignment = history.find((h: any) => h.status === 'ACTIVE');
    const completedAssignment = history.find((h: any) => h.status === 'COMPLETED');

    expect(activeAssignment.siteId).toBe(site2Res.body.data.id);
    expect(completedAssignment.siteId).toBe(site1Res.body.data.id);
    expect(completedAssignment.endDate).toBeDefined();
  });

  it('should archive worker instead of deleting historical records', async () => {
    const owner = await createTestOwner('archive_worker');

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Kamal Hassan',
        trade: 'Painter',
      });

    const workerId = workerRes.body.data.id;

    const archiveRes = await request(app)
      .post(`/api/v1/workers/${workerId}/archive`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    expect(archiveRes.status).toBe(200);

    // Worker still exists but has status ARCHIVED
    const detailsRes = await request(app)
      .get(`/api/v1/workers/${workerId}`)
      .set('Cookie', owner.cookie);

    expect(detailsRes.status).toBe(200);
    expect(detailsRes.body.data.status).toBe('ARCHIVED');
    expect(detailsRes.body.data.archivedAt).toBeDefined();
  });
});
