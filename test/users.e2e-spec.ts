// Real integration test: boots the whole app (guards, Prisma tenant
// extension, BullMQ included) against a live Postgres + Redis. Point
// DATABASE_URL/REDIS_URL at disposable instances before running
// `npm run test:e2e` — `pretest:e2e` applies migrations automatically.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fruct_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'e2e-admin@example.com';
process.env.SMTP_HOST = process.env.SMTP_HOST || '127.0.0.1';
process.env.SMTP_PORT = process.env.SMTP_PORT || '2525';
process.env.MAIL_FROM = process.env.MAIL_FROM || 'crm@example.com';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { hashPassword } from '../src/common/security/password.util';

describe('Users (e2e) — RolesGuard enforcement', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantId: string;
  let ownerAccessToken: string;
  let managerAccessToken: string;
  let someManagerId: string;

  const OWNER_PASSWORD = 'OwnerPassw0rd!';
  const MANAGER_PASSWORD = 'ManagerPassw0rd!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.create({ data: { name: 'E2E Test Tenant' } });
    tenantId = tenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: 'owner@e2e.test',
        fullName: 'E2E Owner',
        role: Role.OWNER,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        mustChangePassword: false,
      },
    });

    const manager = await prisma.user.create({
      data: {
        tenantId,
        email: 'manager@e2e.test',
        fullName: 'E2E Manager',
        role: Role.MANAGER,
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        mustChangePassword: false,
      },
    });
    someManagerId = manager.id;

    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner@e2e.test', password: OWNER_PASSWORD })
      .expect(200);
    ownerAccessToken = ownerLogin.body.accessToken;

    const managerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'manager@e2e.test', password: MANAGER_PASSWORD })
      .expect(200);
    managerAccessToken = managerLogin.body.accessToken;
  });

  afterAll(async () => {
    // Cascades to users/refreshTokens/etc. via onDelete: Cascade in the schema.
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  it('rejects unauthenticated requests to OWNER-only endpoints', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('allows OWNER to create a manager', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({ email: 'new-manager@e2e.test', fullName: 'New Manager', password: 'SomeValidPass1' })
      .expect(201);
  });

  it('allows OWNER to list managers', async () => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .expect(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  describe('MANAGER attempting OWNER-only endpoints', () => {
    it('POST /users -> 403', () => {
      return request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({ email: 'blocked@e2e.test', fullName: 'Should Not Be Created' })
        .expect(403);
    });

    it('GET /users -> 403', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .expect(403);
    });

    it('PATCH /users/:id -> 403', () => {
      return request(app.getHttpServer())
        .patch(`/users/${someManagerId}`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({ commissionPercent: 50 })
        .expect(403);
    });

    it('PATCH /users/:id/block -> 403', () => {
      return request(app.getHttpServer())
        .patch(`/users/${someManagerId}/block`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .expect(403);
    });

    it('DELETE /users/:id -> 403', () => {
      return request(app.getHttpServer())
        .delete(`/users/${someManagerId}`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .expect(403);
    });
  });

  it('still allows MANAGER to read and update their own profile', async () => {
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({ fullName: 'Updated Manager Name' })
      .expect(200);
  });

  it('rejects a MANAGER trying to grant themselves commissionPercent via /users/me (unknown field)', () => {
    return request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${managerAccessToken}`)
      .send({ commissionPercent: 100 })
      .expect(400);
  });
});
