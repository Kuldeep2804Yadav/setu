import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { sessionCookieOptions } from '../../src/config/cookies.js';
import { config } from '../../src/config/index.js';
import { calculateGrossWage } from '../../src/utils/wage.js';
import { RegisterSchema } from '../../src/shared/index.js';
import { sanitizeCsvField } from '../../src/utils/csv.js';

describe('Independent API security and business utilities', () => {
  it('serves the health check without a database connection', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
  it('permits credentialed preflight only for approved origins', async () => {
    const allowed = await request(app).options('/api/v1/sites').set('Origin', config.allowedOrigins[0]).set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe(config.allowedOrigins[0]);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app).options('/api/v1/sites').set('Origin', 'https://evil.invalid');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('rejects an untrusted JSON mutation even with a forged custom header', async () => {
    const res = await request(app).post('/api/v1/sites').set('Origin', 'https://evil.invalid').set('Cookie', 'laboursetu_session=test').set('x-requested-with', 'XMLHttpRequest').send({name:'Attack'});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });
  it('rejects form mutations with an ambient cookie', async () => {
    const res = await request(app).post('/api/v1/sites').set('Cookie', 'laboursetu_session=test').type('text').send('name=Attack');
    expect(res.status).toBe(403);
  });
  it('keeps session cookies HTTP-only and scoped consistently', () => {
    expect(sessionCookieOptions()).toMatchObject({httpOnly:true, path:'/', sameSite:'lax', secure:false});
  });
  it('preserves exact half-up wage arithmetic and hourly rules', () => {
    expect(calculateGrossWage('HOURLY', '133.35', 'PRESENT', '7.5').grossWage.toFixed(2)).toBe('1000.13');
    expect(calculateGrossWage('DAILY', '600', 'HALF_DAY').grossWage.toFixed(2)).toBe('300.00');
    expect(() => calculateGrossWage('DAILY', '600', 'PRESENT', 8)).toThrow();
    expect(() => calculateGrossWage('HOURLY', '100', 'PRESENT', 25)).toThrow();
  });
  it('retains registration validation', () => {
    expect(RegisterSchema.safeParse({organizationName:'X',name:'Y',email:'bad',password:'short'}).success).toBe(false);
  });
  it('retains CSV formula protection', () => {
    expect(sanitizeCsvField('=1+1')).toBe("'=1+1");
  });
});
