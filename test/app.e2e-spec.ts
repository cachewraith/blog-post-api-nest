import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Boots the real app, so it needs a reachable Postgres and a populated `.env`
 * (create the database, then `npm run migration:run`).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  // Versioned routes: `/api` is the prefix, `v1` comes from the controllers.
  const prefix = '/api/v1';

  const unique = Date.now().toString().slice(-9);
  const credentials = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: `ada.${unique}@example.com`,
    phone_number: `+8801${unique}`,
    password: 'Str0ngPassw0rd',
    password_confirmation: 'Str0ngPassw0rd',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is version-neutral, public, and wrapped in the envelope', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          data: { status: 'ok' },
          message: 'Service is healthy',
          status: 200,
        });
      });
  });

  it('GET /users/me is rejected without a token', () => {
    return request(app.getHttpServer()).get(`${prefix}/users/me`).expect(401);
  });

  it('POST /auth/register creates an unverified account and issues no tokens', () => {
    return request(app.getHttpServer())
      .post(`${prefix}/auth/register`)
      .send(credentials)
      .expect(201)
      .expect((res) => {
        expect(res.body.data.requires_otp_verification).toBe(true);
        expect(res.body.data).not.toHaveProperty('access_token');
      });
  });

  it('POST /auth/register rejects a mismatched password confirmation', () => {
    return request(app.getHttpServer())
      .post(`${prefix}/auth/register`)
      .send({ ...credentials, password_confirmation: 'Different1' })
      .expect(400)
      .expect((res) => {
        expect(res.body.errors).toContainEqual(
          expect.objectContaining({ field: 'password_confirmation' }),
        );
      });
  });

  it('POST /auth/login rejects a wrong password without revealing the account', () => {
    return request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: credentials.email, password: 'Wr0ngPassword' })
      .expect(401)
      .expect((res) => {
        expect(res.body.message).toBe('Invalid email or password');
      });
  });

  it('POST /auth/forgot-password answers the same for an unknown address', async () => {
    const known = await request(app.getHttpServer())
      .post(`${prefix}/auth/forgot-password`)
      .send({ email: credentials.email })
      .expect(200);

    const unknown = await request(app.getHttpServer())
      .post(`${prefix}/auth/forgot-password`)
      .send({ email: `nobody.${unique}@example.com` })
      .expect(200);

    expect(known.body.data).toEqual(unknown.body.data);
  });

  it('POST /auth/verify-otp rejects a guessed code', () => {
    return request(app.getHttpServer())
      .post(`${prefix}/auth/verify-otp`)
      .send({ email: credentials.email, otp: '000000' })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toBe('Invalid or expired code');
      });
  });

  it('POST /auth/refresh rejects a forged token', () => {
    return request(app.getHttpServer())
      .post(`${prefix}/auth/refresh`)
      .send({ refresh_token: 'not.a.token' })
      .expect(401);
  });

  it('never leaks a stack trace on error', () => {
    return request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email: 'not-an-email', password: 'x' })
      .expect(400)
      .expect((res) => {
        expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/);
      });
  });
});
