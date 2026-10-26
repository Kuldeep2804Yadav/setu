import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { createTestOwner, createTeamMember } from './helpers.js';
import { Role } from '../src/shared/index.js';

describe('Site Management Module', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should create, list, and view construction site', async () => {
    const owner = await createTestOwner('site_crud');

    const createRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Metro Flyover Phase 2',
        code: 'SITE-MF2',
        location: 'Western Express Highway, Andheri East',
        clientName: 'MMRDA',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.code).toBe('SITE-MF2');

    const siteId = createRes.body.data.id;

    // View site details
    const getRes = await request(app)
      .get(`/api/v1/sites/${siteId}`)
      .set('Cookie', owner.cookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Metro Flyover Phase 2');
    expect(getRes.body.data.status).toBe('ACTIVE');

    // List sites
    const listRes = await request(app)
      .get('/api/v1/sites')
      .set('Cookie', owner.cookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
  });

  it('should prevent duplicate site code within the same organization', async () => {
    const owner = await createTestOwner('site_dup');

    await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Site One',
        code: 'SITE-SAME',
      });

    const dupRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Site Two with same code',
        code: 'SITE-SAME',
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('DUPLICATE_CODE');
  });

  it('should allow the same site code in different contractor organizations', async () => {
    const owner1 = await createTestOwner('contractor_1');
    const owner2 = await createTestOwner('contractor_2');

    const res1 = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner1.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Contractor 1 Site', code: 'COMMON-01' });

    const res2 = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner2.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Contractor 2 Site', code: 'COMMON-01' });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it('should assign and update supervisors on a site', async () => {
    const owner = await createTestOwner('site_sups');
    const sup1 = await createTeamMember(owner, Role.SUPERVISOR, 'sup1');
    const sup2 = await createTeamMember(owner, Role.SUPERVISOR, 'sup2');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Supervised Site',
        code: 'SITE-SUP-01',
        supervisorIds: [sup1.user.id],
      });

    expect(siteRes.status).toBe(201);
    const siteId = siteRes.body.data.id;

    // Update supervisors list to include both sup1 and sup2
    const updateSupRes = await request(app)
      .post(`/api/v1/sites/${siteId}/supervisors`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        supervisorIds: [sup1.user.id, sup2.user.id],
      });

    expect(updateSupRes.status).toBe(200);
    expect(updateSupRes.body.data.supervisors.length).toBe(2);
  });

  it('should archive site and update status', async () => {
    const owner = await createTestOwner('archive_site');

    const siteRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({ name: 'Completed Project', code: 'SITE-COMP' });

    const siteId = siteRes.body.data.id;

    const archiveRes = await request(app)
      .post(`/api/v1/sites/${siteId}/archive`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.status).toBe('ARCHIVED');
    expect(archiveRes.body.data.archivedAt).toBeDefined();
  });
});
