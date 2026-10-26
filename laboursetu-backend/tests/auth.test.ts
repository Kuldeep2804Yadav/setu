import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { clearDatabase } from './setup.js';
import { config } from '../src/config/index.js';

describe('Authentication Module', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should register a new organization and owner successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Shiv Shakti Builders',
        name: 'Shiv Sharma',
        email: 'shiv@builders.com',
        phone: '9812345678',
        password: 'Password123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('shiv@builders.com');
    expect(res.body.data.user.role).toBe('OWNER');
    expect(res.body.data.user.organization.name).toBe('Shiv Shakti Builders');
    expect(res.headers['set-cookie']).toBeDefined();
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toContain(config.sessionCookieName);
    expect(cookie).toContain('HttpOnly');
  });

  it('should reject registration if email is already taken', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Org One',
        name: 'User One',
        email: 'duplicate@test.com',
        phone: '9812345678',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Org Two',
        name: 'User Two',
        email: 'duplicate@test.com',
        phone: '9899999999',
        password: 'Password123!',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should login with valid credentials and return session cookie', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Laxmi Infratech',
        name: 'Laxman Rao',
        email: 'laxman@laxmi.com',
        phone: '9822334455',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'laxman@laxmi.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.name).toBe('Laxman Rao');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should return safe error for invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@test.com',
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('should authenticate requests using session cookie and fetch /me', async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Apex Constro',
        name: 'Arun Patel',
        email: 'arun@apex.com',
        phone: '9833445566',
        password: 'Password123!',
      });

    const cookie = registerRes.headers['set-cookie'][0];

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe('arun@apex.com');
  });

  it('should reject /me without session cookie', async () => {
    const meRes = await request(app).get('/api/v1/auth/me');
    expect(meRes.status).toBe(401);
  });

  it('should logout and invalidate session', async () => {
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'BuildWell',
        name: 'Bipin Singh',
        email: 'bipin@buildwell.com',
        password: 'Password123!',
      });

    const cookie = registerRes.headers['set-cookie'][0];

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('x-requested-with', 'XMLHttpRequest');

    expect(logoutRes.status).toBe(200);

    // After logout, accessing /me with old cookie should fail
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(401);
  });

  it('should perform complete password recovery flow', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        organizationName: 'Recovery Test Org',
        name: 'Recovery User',
        email: 'recover@test.com',
        password: 'OldPassword123!',
      });

    // Request forgot password
    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'recover@test.com' });

    expect(forgotRes.status).toBe(200);
    const token = forgotRes.body.data.debugToken;
    expect(token).toBeDefined();

    // Reset password with token
    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token,
        password: 'NewPassword123!',
      });

    expect(resetRes.status).toBe(200);

    // Login with new password
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'recover@test.com',
        password: 'NewPassword123!',
      });

    expect(loginRes.status).toBe(200);

    // Login with old password fails
    const oldLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'recover@test.com',
        password: 'OldPassword123!',
      });

    expect(oldLoginRes.status).toBe(401);
  });
});
