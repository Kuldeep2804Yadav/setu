import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { createTestOwner } from './helpers.js';

describe('Validation and Security Handling', () => {
  it('should reject registration with invalid email or short password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'X',
        name: 'Y',
        email: 'invalid-email',
        password: 'short',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('should reject invalid Indian phone numbers', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Valid Builders',
        name: 'Valid Name',
        email: 'valid@builders.com',
        phone: '12345', // Invalid format: must be 10 digits starting with 6-9
        password: 'Password123!',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.details[0].field).toBe('phone');
  });

  it('should reject negative or zero wage rates', async () => {
    const owner = await createTestOwner('validation_wage');

    const workerRes = await request(app)
      .post('/api/v1/workers')
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        name: 'Ganesh Singh',
        trade: 'Helper',
      });

    const workerId = workerRes.body.data.id;

    const wageRes = await request(app)
      .post(`/api/v1/workers/${workerId}/wage-rates`)
      .set('Cookie', owner.cookie)
      .set('x-requested-with', 'XMLHttpRequest')
      .send({
        wageType: 'DAILY',
        rate: -100, // Negative wage rate
        effectiveFrom: new Date().toISOString(),
      });

    expect(wageRes.status).toBe(400);
    expect(wageRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject CSRF attack attempts (cookie mutation without CSRF header or JSON content type)', async () => {
    const owner = await createTestOwner('csrf_test');

    // Simulate cross-site form submission: sends cookie, text/plain content-type, no custom header
    const csrfRes = await request(app)
      .post('/api/v1/sites')
      .set('Cookie', owner.cookie)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ name: 'CSRF Site', code: 'CSRF-01' }));

    expect(csrfRes.status).toBe(403);
    expect(csrfRes.body.error.code).toBe('CSRF_INVALID');
  });
});
