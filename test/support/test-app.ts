// Shared bootstrap for e2e specs — boots the real AppModule (guards, tenant
// Prisma extension, BullMQ included) against whatever Postgres/Redis the
// environment variables point at. Each spec file sets those env vars before
// importing this helper (see users.e2e-spec.ts for the established pattern);
// this file only centralizes app wiring, not env defaults, since letting
// every suite pick its own defaults would hide accidental cross-suite reuse
// of the same database.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthTokensDto } from '../../src/auth/dto/auth-tokens.dto';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { hashPassword } from '../../src/common/security/password.util';

export async function bootstrapTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export interface TestTenantUser {
  id: string;
  email: string;
  accessToken: string;
}

export interface TestTenant {
  tenantId: string;
  owner: TestTenantUser;
}

const DEFAULT_PASSWORD = 'TestPassw0rd!';

/** Creates a tenant + OWNER directly via Prisma (bypassing the seed script), then logs in for a real access token. */
export async function createTenantWithOwner(
  app: INestApplication,
  prisma: PrismaService,
  opts: { tenantName: string; ownerEmail: string },
): Promise<TestTenant> {
  const tenant = await prisma.tenant.create({ data: { name: opts.tenantName } });
  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: opts.ownerEmail,
      fullName: 'Test Owner',
      role: Role.OWNER,
      passwordHash: await hashPassword(DEFAULT_PASSWORD),
      mustChangePassword: false,
    },
  });

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: opts.ownerEmail, password: DEFAULT_PASSWORD })
    .expect(200);

  return {
    tenantId: tenant.id,
    owner: {
      id: owner.id,
      email: opts.ownerEmail,
      accessToken: (login.body as AuthTokensDto).accessToken,
    },
  };
}

/** Creates a MANAGER in an existing tenant and logs in for a real access token. */
export async function createManagerInTenant(
  app: INestApplication,
  prisma: PrismaService,
  opts: {
    tenantId: string;
    email: string;
    commissionPercent?: number;
    maxDiscountPercent?: number;
  },
): Promise<TestTenantUser> {
  const manager = await prisma.user.create({
    data: {
      tenantId: opts.tenantId,
      email: opts.email,
      fullName: 'Test Manager',
      role: Role.MANAGER,
      passwordHash: await hashPassword(DEFAULT_PASSWORD),
      mustChangePassword: false,
      commissionPercent: opts.commissionPercent ?? 10,
      maxDiscountPercent: opts.maxDiscountPercent ?? 5,
    },
  });

  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: opts.email, password: DEFAULT_PASSWORD })
    .expect(200);

  return {
    id: manager.id,
    email: opts.email,
    accessToken: (login.body as AuthTokensDto).accessToken,
  };
}

export function authHeader(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/**
 * supertest types `Response.body` as `any` — every spec in this suite reads
 * it immediately through this helper instead of accessing `.body` directly,
 * so the cast to the expected shape happens in exactly one place instead of
 * being repeated (and potentially forgotten) at each call site.
 */
export function bodyOf<T>(response: request.Response): T {
  return response.body as T;
}
