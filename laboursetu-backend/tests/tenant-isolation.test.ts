import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner } from './helpers.js';

describe('Tenant Isolation & Multitenancy Security', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should strictly isolate data between different contractors (cross-tenant access rejected)', async () => {
    // 1. Setup Contractor A
    const tenantA = await createTestOwner('contractor_a');

    // Tenant A creates Site A
    const siteARes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', tenantA.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Site Alpha',
        code: 'SITE-ALPHA',
        location: 'Mumbai',
      });
    expect(siteARes.status).toBe(201);
    const siteAId = siteARes.body.data.id;

    // Tenant A creates Worker A
    const workerARes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', tenantA.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Worker Alpha',
        code: 'WRK-ALPHA',
        mobileNumber: '9811111111',
        trade: 'Mason',
      });
    expect(workerARes.status).toBe(201);
    const workerAId = workerARes.body.data.id;

    // 2. Setup Contractor B
    const tenantB = await createTestOwner('contractor_b');

    // Tenant B creates Site B
    const siteBRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', tenantB.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Site Beta',
        code: 'SITE-BETA',
        location: 'Delhi',
      });
    expect(siteBRes.status).toBe(201);

    // 3. IDOR / Cross-Tenant Attempts by Tenant B on Tenant A's resources
    // Direct site read attempt
    const getSiteRes = await request(app)
      .get(`/api/v1/sites/${siteAId}`)
      .set('Cookie', tenantB.cookie);
    expect(getSiteRes.status).toBe(404);

    // Site update attempt
    const updateSiteRes = await request(app)
      .put(`/api/v1/sites/${siteAId}`)
      .set('Cookie', tenantB.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Hacked Site Name' });
    expect(updateSiteRes.status).toBe(404);

    // Site archive attempt
    const archiveSiteRes = await request(app)
      .post(`/api/v1/sites/${siteAId}/archive`)
      .set('Cookie', tenantB.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(archiveSiteRes.status).toBe(404);

    // Direct worker read attempt
    const getWorkerRes = await request(app)
      .get(`/api/v1/workers/${workerAId}`)
      .set('Cookie', tenantB.cookie);
    expect(getWorkerRes.status).toBe(404);

    // Worker update attempt
    const updateWorkerRes = await request(app)
      .put(`/api/v1/workers/${workerAId}`)
      .set('Cookie', tenantB.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Hacked Worker Name' });
    expect(updateWorkerRes.status).toBe(404);

    // Worker archive attempt
    const archiveWorkerRes = await request(app)
      .post(`/api/v1/workers/${workerAId}/archive`)
      .set('Cookie', tenantB.cookie)
      .set('x-requested-with', 'XMLHttpRequest');
    expect(archiveWorkerRes.status).toBe(404);

    // 4. List filtering check: Tenant B's lists must NOT contain Tenant A's items
    const listSitesRes = await request(app)
      .get('/api/v1/sites')
      .set('Cookie', tenantB.cookie);
    expect(listSitesRes.status).toBe(200);
    const sites = listSitesRes.body.data;
    expect(sites.length).toBe(1);
    expect(sites[0].code).toBe('SITE-BETA');

    const listWorkersRes = await request(app)
      .get('/api/v1/workers')
      .set('Cookie', tenantB.cookie);
    expect(listWorkersRes.status).toBe(200);
    expect(listWorkersRes.body.data.length).toBe(0);
  });
});
