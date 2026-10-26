import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';
import { prisma } from '../src/database/index.js';

describe('Attendance Eligibility & Interval Boundaries', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should enforce inclusive start and exclusive end on site assignment intervals', async () => {
    const owner = await createTestOwner('eligibility_test');

    // Create Site
    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Bridge Site', code: 'SITE-BRG' });
    const siteId = siteRes.body.data.id;

    // Create Worker
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Anil Yadav', trade: 'Mason' });
    const workerId = workerRes.body.data.id;

    // Assign worker to Site with interval: 2026-01-01 to 2026-01-10
    await prisma.workerSiteAssignment.deleteMany({ where: { workerId } });
    await prisma.workerSiteAssignment.create({
      data: {
        workerId,
        siteId,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-10T00:00:00.000Z'), // Exclusive end date
        status: 'ACTIVE',
      },
    });

    // 1. Inclusive start date: 2026-01-01 -> ELIGIBLE
    const rosterStart = await request(app)
      .get(`/api/v1/attendance/roster/${siteId}?date=2026-01-01`)
      .set('Cookie', owner.cookie);
    expect(rosterStart.status).toBe(200);
    const workerStart = rosterStart.body.data.workers.find((w: any) => w.id === workerId);
    expect(workerStart.isEligible).toBe(true);

    // 2. Inside interval: 2026-01-05 -> ELIGIBLE
    const rosterMid = await request(app)
      .get(`/api/v1/attendance/roster/${siteId}?date=2026-01-05`)
      .set('Cookie', owner.cookie);
    expect(rosterMid.status).toBe(200);
    const workerMid = rosterMid.body.data.workers.find((w: any) => w.id === workerId);
    expect(workerMid.isEligible).toBe(true);

    // 3. Exclusive end date: 2026-01-10 -> INELIGIBLE (assignment ended before or on this day)
    const rosterEnd = await request(app)
      .get(`/api/v1/attendance/roster/${siteId}?date=2026-01-10`)
      .set('Cookie', owner.cookie);
    expect(rosterEnd.status).toBe(200);
    const workerEnd = rosterEnd.body.data.workers.find((w: any) => w.id === workerId);
    expect(workerEnd.isEligible).toBe(false);
    expect(workerEnd.ineligibilityReason).toContain('No active site assignment');

    // 4. After interval: 2026-01-15 -> INELIGIBLE
    const rosterAfter = await request(app)
      .get(`/api/v1/attendance/roster/${siteId}?date=2026-01-15`)
      .set('Cookie', owner.cookie);
    expect(rosterAfter.status).toBe(200);
    const workerAfter = rosterAfter.body.data.workers.find((w: any) => w.id === workerId);
    expect(workerAfter.isEligible).toBe(false);
  });

  it('should allow historical attendance for archived workers only when eligible on that date', async () => {
    const owner = await createTestOwner('archived_eligibility');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Tunnel Site', code: 'SITE-TNL' });
    const siteId = siteRes.body.data.id;

    // Create worker assigned from 2026-01-01
    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Sunil Paswan',
        trade: 'Helper',
        initialSiteId: siteId,
      });
    const workerId = workerRes.body.data.id;

    // Set assignment start to 2026-01-01 and archive worker on 2026-01-20
    await prisma.workerSiteAssignment.updateMany({
      where: { workerId },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z') },
    });

    await prisma.worker.update({
      where: { id: workerId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date('2026-01-20T00:00:00.000Z'),
      },
    });

    // 1. Attendance on 2026-01-10 (before archiving) -> ELIGIBLE
    const rosterBefore = await request(app)
      .get(`/api/v1/attendance/roster/${siteId}?date=2026-01-10`)
      .set('Cookie', owner.cookie);
    expect(rosterBefore.status).toBe(200);
    const workerBefore = rosterBefore.body.data.workers.find((w: any) => w.id === workerId);
    expect(workerBefore.isEligible).toBe(true);

    // 2. Attendance on 2026-01-25 (after archiving) -> INELIGIBLE
    const rosterAfter = await request(app)
      .get(`/api/v1/attendance/roster/${siteId}?date=2026-01-25`)
      .set('Cookie', owner.cookie);
    expect(rosterAfter.status).toBe(200);
    const workerAfter = rosterAfter.body.data.workers.find((w: any) => w.id === workerId);
    expect(workerAfter.isEligible).toBe(false);
    expect(workerAfter.ineligibilityReason).toContain('already archived prior to this date');
  });
});
