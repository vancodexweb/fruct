// Real integration test: two separate tenants, each with their own OWNER,
// exercising the tenant Prisma extension end-to-end over HTTP. This is the
// suite that directly answers "can tenant B ever see tenant A's data" for
// every module added in this phase — every other e2e spec assumes isolation
// holds and tests business logic within a single tenant instead.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://fruct:fruct@localhost:5432/fruct_dev';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'e2e-admin@example.com';
process.env.SMTP_HOST = process.env.SMTP_HOST || '127.0.0.1';
process.env.SMTP_PORT = process.env.SMTP_PORT || '2525';
process.env.MAIL_FROM = process.env.MAIL_FROM || 'crm@example.com';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  authHeader,
  bodyOf,
  bootstrapTestApp,
  createTenantWithOwner,
  TestTenant,
} from './support/test-app';

describe('Tenant isolation (e2e) — cross-tenant leakage', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  let categoryAId: string;
  let productAId: string;
  let warehouseAId: string;
  let leadAId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());

    tenantA = await createTenantWithOwner(app, prisma, {
      tenantName: 'Tenant A',
      ownerEmail: 'owner-a@isolation.test',
    });
    tenantB = await createTenantWithOwner(app, prisma, {
      tenantName: 'Tenant B',
      ownerEmail: 'owner-b@isolation.test',
    });

    const category = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/categories')
        .set(...authHeader(tenantA.owner.accessToken))
        .send({ name: 'Tenant A Category' })
        .expect(201),
    );
    categoryAId = category.id;

    const warehouse = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(tenantA.owner.accessToken))
        .send({ name: 'Tenant A Warehouse', city: 'Самара' })
        .expect(201),
    );
    warehouseAId = warehouse.id;

    const product = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/products')
        .set(...authHeader(tenantA.owner.accessToken))
        .send({ name: 'Tenant A Chair', categoryId: categoryAId, price: 10000 })
        .expect(201),
    );
    productAId = product.id;

    const lead = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/leads')
        .set(...authHeader(tenantA.owner.accessToken))
        .send({ fullName: 'Tenant A Lead' })
        .expect(201),
    );
    leadAId = lead.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantA.tenantId } });
    await prisma.tenant.delete({ where: { id: tenantB.tenantId } });
    await app.close();
  });

  it("tenant B's category list never contains tenant A's category", async () => {
    const response = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(tenantB.owner.accessToken))
      .expect(200);
    const ids = (response.body as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(categoryAId);
  });

  it("tenant B's product list never contains tenant A's product", async () => {
    const response = await request(app.getHttpServer())
      .get('/products')
      .set(...authHeader(tenantB.owner.accessToken))
      .expect(200);
    const ids = (response.body as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(productAId);
  });

  it('tenant B OWNER gets 404 (not 200/403) fetching tenant A product by id directly', async () => {
    await request(app.getHttpServer())
      .get(`/products/${productAId}`)
      .set(...authHeader(tenantB.owner.accessToken))
      .expect(404);
  });

  it('tenant B OWNER cannot patch a tenant A product by id (404, no leakage of existence via a different code)', async () => {
    await request(app.getHttpServer())
      .patch(`/products/${productAId}`)
      .set(...authHeader(tenantB.owner.accessToken))
      .send({ price: 1 })
      .expect(404);
  });

  it("tenant B's warehouse list never contains tenant A's warehouse", async () => {
    const response = await request(app.getHttpServer())
      .get('/warehouses')
      .set(...authHeader(tenantB.owner.accessToken))
      .expect(200);
    const ids = (response.body as { id: string }[]).map((w) => w.id);
    expect(ids).not.toContain(warehouseAId);
  });

  it('tenant B OWNER cannot read stock for a tenant A warehouse (404)', async () => {
    await request(app.getHttpServer())
      .get(`/warehouses/${warehouseAId}/stock`)
      .set(...authHeader(tenantB.owner.accessToken))
      .expect(404);
  });

  it("tenant B's lead list never contains tenant A's lead", async () => {
    const response = await request(app.getHttpServer())
      .get('/leads')
      .set(...authHeader(tenantB.owner.accessToken))
      .expect(200);
    const ids = (response.body as { id: string }[]).map((l) => l.id);
    expect(ids).not.toContain(leadAId);
  });

  it('tenant B OWNER gets 404 fetching tenant A lead by id directly', async () => {
    await request(app.getHttpServer())
      .get(`/leads/${leadAId}`)
      .set(...authHeader(tenantB.owner.accessToken))
      .expect(404);
  });

  it('tenant B cannot create a deal against tenant A lead/warehouse/product ids (404 on lead lookup first)', async () => {
    await request(app.getHttpServer())
      .post('/deals')
      .set(...authHeader(tenantB.owner.accessToken))
      .send({
        leadId: leadAId,
        warehouseId: warehouseAId,
        items: [{ productId: productAId, quantity: 1 }],
      })
      .expect(404);
  });

  it('tenant A and tenant B can each independently create a category named identically without conflict', async () => {
    await request(app.getHttpServer())
      .post('/categories')
      .set(...authHeader(tenantB.owner.accessToken))
      .send({ name: 'Tenant A Category' })
      .expect(201);
  });

  it("a tenant A JWT cannot be used to satisfy tenant B's TenantGuard by forging a header (no such header exists — tenant comes only from the token)", async () => {
    // There is no X-Tenant-Id-style header anywhere in this API — the
    // tenant is derived exclusively from the authenticated user embedded in
    // the JWT itself, so there is nothing to spoof. This test documents
    // that invariant: tenant A's own token keeps working normally, scoped
    // to tenant A, no matter what headers are attached.
    const response = await request(app.getHttpServer())
      .get('/categories')
      .set(...authHeader(tenantA.owner.accessToken))
      .set('X-Tenant-Id', tenantB.tenantId)
      .expect(200);
    const ids = (response.body as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(categoryAId);
  });
});
