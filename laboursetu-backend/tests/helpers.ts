import request from 'supertest';
import { app } from '../src/app.js';
import { config } from '../src/config/index.js';
import { Role } from '../src/shared/index.js';

export interface TestSession {
  cookie: string;
  token: string;
  user: any;
}

export async function createTestOwner(
  suffix: string = `${Date.now()}_${Math.floor(Math.random() * 1000)}`
): Promise<TestSession> {
  const registerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({
      organizationName: `Test Org ${suffix}`,
      name: `Owner ${suffix}`,
      email: `owner_${suffix}@test.com`,
      phone: '9876543210',
      password: 'Password123!',
    });

  if (registerRes.status !== 201) {
    throw new Error(`Failed to create test owner: ${JSON.stringify(registerRes.body)}`);
  }

  const setCookie = registerRes.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie || '');
  const token = registerRes.body.data.token;
  const user = registerRes.body.data.user;

  return { cookie, token, user };
}

export async function createTeamMember(
  ownerSession: TestSession,
  role: Role,
  suffix: string = `${Date.now()}_${Math.floor(Math.random() * 1000)}`
): Promise<TestSession> {
  const addRes = await request(app)
    .post('/api/v1/organization/team')
    .set('Cookie', ownerSession.cookie)
    .set('x-requested-with', 'XMLHttpRequest')
    .send({
      name: `Member ${suffix}`,
      email: `member_${role.toLowerCase()}_${suffix}@test.com`,
      phone: '9876543211',
      password: 'Password123!',
      role,
    });

  if (addRes.status !== 201) {
    throw new Error(`Failed to add team member: ${JSON.stringify(addRes.body)}`);
  }

  // Login as this member
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: `member_${role.toLowerCase()}_${suffix}@test.com`,
      password: 'Password123!',
    });

  const setCookie = loginRes.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : (setCookie || '');

  return {
    cookie,
    token: loginRes.body.data.token,
    user: loginRes.body.data.user,
  };
}
