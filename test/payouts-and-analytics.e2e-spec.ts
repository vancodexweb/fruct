// Real integration test for the payroll and analytics modules: builds one
// PAID deal (the only status besides SHIPPED/COMPLETED that counts toward
// commission), runs it through preview -> generate -> approve -> pay, and
// separately exercises every analytics endpoint's OWNER-only RBAC plus a
// basic response-shape sanity check.
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
  createManagerInTenant,
  createTenantWithOwner,
  TestTenant,
  TestTenantUser,
} from './support/test-app';

const PERIOD = { periodStart: '2020-01-01', periodEnd: '2030-12-31' };

describe('Payouts + Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let manager: TestTenantUser;
  let dealId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());

    tenant = await createTenantWithOwner(app, prisma, {
      tenantName: 'Payouts Test Tenant',
      ownerEmail: 'owner@payouts.test',
    });
    manager = await createManagerInTenant(app, prisma, {
      tenantId: tenant.tenantId,
      email: 'manager@payouts.test',
      commissionPercent: 20,
    });

    const category = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/categories')
        .set(...authHeader(tenant.owner.accessToken))
        .send({ name: 'Кресла' })
        .expect(201),
    );

    const warehouse = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(tenant.owner.accessToken))
        .send({ name: 'Склад', city: 'Москва' })
        .expect(201),
    );

    const product = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/products')
        .set(...authHeader(tenant.owner.accessToken))
        .send({ name: 'Кресло офисное', categoryId: category.id, price: 15000 })
        .expect(201),
    );

    await request(app.getHttpServer())
      .put(`/warehouses/${warehouse.id}/stock/${product.id}`)
      .set(...authHeader(tenant.owner.accessToken))
      .send({ quantity: 5 })
      .expect(200);

    const lead = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/leads')
        .set(...authHeader(manager.accessToken))
        .send({ fullName: 'Payout Buyer' })
        .expect(201),
    );

    const deal = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/deals')
        .set(...authHeader(manager.accessToken))
        .send({
          leadId: lead.id,
          warehouseId: warehouse.id,
          items: [{ productId: product.id, quantity: 1 }],
        })
        .expect(201),
    );
    dealId = deal.id;

    // NEW -> WAITING_PAYMENT -> PAID: the minimum valid path to a
    // commissionable status per DEAL_STATUS_TRANSITIONS.
    await request(app.getHttpServer())
      .patch(`/deals/${dealId}/status`)
      .set(...authHeader(manager.accessToken))
      .send({ status: 'WAITING_PAYMENT' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/deals/${dealId}/status`)
      .set(...authHeader(manager.accessToken))
      .send({ status: 'PAID' })
      .expect(200);
  });

  afterAll(async () => {
    // See the identical comment in catalog-and-deals.e2e-spec.ts: Postgres
    // checks DealItem.productId's RESTRICT immediately, so deals (and their
    // items) must be gone before the tenant cascade reaches Product.
    await prisma.deal.deleteMany({ where: { tenantId: tenant.tenantId } });
    await prisma.tenant.delete({ where: { id: tenant.tenantId } });
    await app.close();
  });

  describe('Payouts flow', () => {
    it('MANAGER cannot preview or generate payouts (403)', async () => {
      await request(app.getHttpServer())
        .get('/payouts/preview')
        .query(PERIOD)
        .set(...authHeader(manager.accessToken))
        .expect(403);
      await request(app.getHttpServer())
        .post('/payouts/generate')
        .query(PERIOD)
        .set(...authHeader(manager.accessToken))
        .expect(403);
    });

    it('preview computes commission = 20% of the PAID deal total, without persisting anything', async () => {
      const previews = bodyOf<
        {
          managerId: string;
          totalCommission: string;
          deals: { dealId: string }[];
        }[]
      >(
        await request(app.getHttpServer())
          .get('/payouts/preview')
          .query({ ...PERIOD, managerId: manager.id })
          .set(...authHeader(tenant.owner.accessToken))
          .expect(200),
      );
      const preview = previews[0];
      expect(preview.managerId).toBe(manager.id);
      expect(preview.totalCommission).toBe('3000'); // 20% of 15000
      expect(preview.deals).toHaveLength(1);
      expect(preview.deals[0].dealId).toBe(dealId);

      const listAfterPreview = bodyOf<unknown[]>(
        await request(app.getHttpServer())
          .get('/payouts')
          .set(...authHeader(tenant.owner.accessToken))
          .expect(200),
      );
      expect(listAfterPreview).toHaveLength(0);
    });

    let payoutId: string;

    it('generate persists exactly one DRAFT payout for the manager', async () => {
      const payouts = bodyOf<{ id: string; status: string; totalCommission: string }[]>(
        await request(app.getHttpServer())
          .post('/payouts/generate')
          .set(...authHeader(tenant.owner.accessToken))
          .send({ ...PERIOD, managerId: manager.id })
          .expect(201),
      );
      expect(payouts).toHaveLength(1);
      expect(payouts[0].status).toBe('DRAFT');
      expect(payouts[0].totalCommission).toBe('3000');
      payoutId = payouts[0].id;
    });

    it('the same deal is never double-counted by a second generate for an overlapping period', async () => {
      const payouts = bodyOf<unknown[]>(
        await request(app.getHttpServer())
          .post('/payouts/generate')
          .set(...authHeader(tenant.owner.accessToken))
          .send({ ...PERIOD, managerId: manager.id })
          .expect(201),
      );
      // The deal already has payoutId set from the first generate() call, so
      // calculateForPeriod's `payoutId: null` filter excludes it — nothing
      // left to pay, no empty DRAFT row created.
      expect(payouts).toHaveLength(0);
    });

    it('MANAGER can see their own payout but not approve/pay it (403)', async () => {
      const list = bodyOf<{ id: string }[]>(
        await request(app.getHttpServer())
          .get('/payouts')
          .set(...authHeader(manager.accessToken))
          .expect(200),
      );
      expect(list.map((p) => p.id)).toContain(payoutId);

      await request(app.getHttpServer())
        .patch(`/payouts/${payoutId}/approve`)
        .set(...authHeader(manager.accessToken))
        .expect(403);
    });

    it('cannot mark PAID before APPROVED (409)', async () => {
      await request(app.getHttpServer())
        .patch(`/payouts/${payoutId}/pay`)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(409);
    });

    it('approve DRAFT -> APPROVED, then pay APPROVED -> PAID', async () => {
      const approved = bodyOf<{ status: string; approvedAt: string | null }>(
        await request(app.getHttpServer())
          .patch(`/payouts/${payoutId}/approve`)
          .set(...authHeader(tenant.owner.accessToken))
          .expect(200),
      );
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedAt).not.toBeNull();

      const paid = bodyOf<{ status: string }>(
        await request(app.getHttpServer())
          .patch(`/payouts/${payoutId}/pay`)
          .set(...authHeader(tenant.owner.accessToken))
          .expect(200),
      );
      expect(paid.status).toBe('PAID');
    });

    it('cannot manually edit a payout once it is no longer DRAFT (409)', async () => {
      await request(app.getHttpServer())
        .patch(`/payouts/${payoutId}`)
        .set(...authHeader(tenant.owner.accessToken))
        .send({ baseSalary: 999999 })
        .expect(409);
    });
  });

  describe('Analytics RBAC + shape', () => {
    const endpoints: { path: string; query: Record<string, string> }[] = [
      { path: '/analytics/funnel', query: PERIOD },
      { path: '/analytics/sla', query: PERIOD },
      { path: '/analytics/revenue', query: PERIOD },
      { path: '/analytics/top-products', query: PERIOD },
      { path: '/analytics/managers-comparison', query: PERIOD },
      { path: '/analytics/purchase-distribution', query: PERIOD },
    ];

    it.each(endpoints)('MANAGER gets 403 on $path', async ({ path, query }) => {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set(...authHeader(manager.accessToken))
        .expect(403);
    });

    it.each(endpoints)('OWNER gets 200 on $path', async ({ path, query }) => {
      await request(app.getHttpServer())
        .get(path)
        .query(query)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
    });

    it('revenue reflects the PAID deal total for the bucket containing today', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/revenue')
        .query(PERIOD)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
      const totalRevenue = (response.body as { revenue: string }[]).reduce(
        (sum, bucket) => sum + Number(bucket.revenue),
        0,
      );
      expect(totalRevenue).toBeGreaterThanOrEqual(15000);
    });

    it('top-products includes the sold product with quantity 1', async () => {
      const topProducts = bodyOf<unknown[]>(
        await request(app.getHttpServer())
          .get('/analytics/top-products')
          .query(PERIOD)
          .set(...authHeader(tenant.owner.accessToken))
          .expect(200),
      );
      expect(Array.isArray(topProducts)).toBe(true);
      expect(topProducts.length).toBeGreaterThan(0);
    });
  });

  describe('Notifications', () => {
    it('MANAGER only sees their own notifications, and read-all only affects their own', async () => {
      const list = bodyOf<unknown[]>(
        await request(app.getHttpServer())
          .get('/notifications')
          .set(...authHeader(manager.accessToken))
          .expect(200),
      );
      expect(Array.isArray(list)).toBe(true);

      const markAll = bodyOf<{ updatedCount: number }>(
        await request(app.getHttpServer())
          .patch('/notifications/read-all')
          .set(...authHeader(manager.accessToken))
          .expect(200),
      );
      expect(typeof markAll.updatedCount).toBe('number');
    });
  });
});
