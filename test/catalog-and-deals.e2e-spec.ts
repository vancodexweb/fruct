// Real integration test for the core sales path added in this phase:
// catalog RBAC, lead assignment/visibility, deal creation against real
// stock (including the atomic decrement and its 409 on insufficient
// quantity), the commission snapshot, and the deal status state machine.
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

describe('Catalog + Leads + Deals (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let managerA: TestTenantUser;
  let managerB: TestTenantUser;

  let categoryId: string;
  let warehouseId: string;
  let productId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());

    tenant = await createTenantWithOwner(app, prisma, {
      tenantName: 'Deals Test Tenant',
      ownerEmail: 'owner@deals.test',
    });
    // 10% commission, 5% max discount — used below to assert the exact
    // commission snapshot and the manager discount cap.
    managerA = await createManagerInTenant(app, prisma, {
      tenantId: tenant.tenantId,
      email: 'manager-a@deals.test',
      commissionPercent: 10,
      maxDiscountPercent: 5,
    });
    managerB = await createManagerInTenant(app, prisma, {
      tenantId: tenant.tenantId,
      email: 'manager-b@deals.test',
    });

    const category = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/categories')
        .set(...authHeader(tenant.owner.accessToken))
        .send({ name: 'Кресла' })
        .expect(201),
    );
    categoryId = category.id;

    const warehouse = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/warehouses')
        .set(...authHeader(tenant.owner.accessToken))
        .send({ name: 'Основной склад', city: 'Самара' })
        .expect(201),
    );
    warehouseId = warehouse.id;

    const product = bodyOf<{ id: string }>(
      await request(app.getHttpServer())
        .post('/products')
        .set(...authHeader(tenant.owner.accessToken))
        .send({ name: 'DXRacer Formula', categoryId, price: 20000 })
        .expect(201),
    );
    productId = product.id;

    await request(app.getHttpServer())
      .put(`/warehouses/${warehouseId}/stock/${productId}`)
      .set(...authHeader(tenant.owner.accessToken))
      .send({ quantity: 3 })
      .expect(200);
  });

  afterAll(async () => {
    // Deal.tenantId/DealItem.dealId cascade fine on their own, but
    // DealItem.productId has no onDelete (defaults to RESTRICT — see the
    // catalog module's own onDelete notes), and Postgres checks RESTRICT
    // immediately rather than deferring to end-of-statement like NO ACTION.
    // Cascading straight from Tenant would therefore try to delete a
    // Product while a DealItem row in the same cascade still references it
    // and fail. Deleting deals (and their items) first in a separate
    // statement avoids that ordering issue.
    await prisma.deal.deleteMany({ where: { tenantId: tenant.tenantId } });
    await prisma.tenant.delete({ where: { id: tenant.tenantId } });
    await app.close();
  });

  describe('Catalog RBAC', () => {
    it('MANAGER cannot create a category (403)', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set(...authHeader(managerA.accessToken))
        .send({ name: 'Should Fail' })
        .expect(403);
    });

    it('MANAGER can still read categories/products/warehouses (200)', async () => {
      await request(app.getHttpServer())
        .get('/categories')
        .set(...authHeader(managerA.accessToken))
        .expect(200);
      await request(app.getHttpServer())
        .get('/products')
        .set(...authHeader(managerA.accessToken))
        .expect(200);
    });

    it('MANAGER cannot set stock directly (403)', async () => {
      await request(app.getHttpServer())
        .put(`/warehouses/${warehouseId}/stock/${productId}`)
        .set(...authHeader(managerA.accessToken))
        .send({ quantity: 999 })
        .expect(403);
    });

    it('search by product name returns the seeded product', async () => {
      const response = await request(app.getHttpServer())
        .get('/products')
        .query({ search: 'DXRacer' })
        .set(...authHeader(managerA.accessToken))
        .expect(200);
      const ids = (response.body as { id: string }[]).map((p) => p.id);
      expect(ids).toContain(productId);
    });
  });

  describe('Lead visibility', () => {
    let unassignedLeadId: string;
    let managerALeadId: string;

    beforeAll(async () => {
      const unassigned = bodyOf<{ id: string; assignedManagerId: string | null }>(
        await request(app.getHttpServer())
          .post('/leads')
          .set(...authHeader(tenant.owner.accessToken))
          .send({ fullName: 'Unassigned Lead' })
          .expect(201),
      );
      unassignedLeadId = unassigned.id;
      expect(unassigned.assignedManagerId).toBeNull();

      await request(app.getHttpServer())
        .patch(`/leads/${unassignedLeadId}/assign`)
        .set(...authHeader(tenant.owner.accessToken))
        .send({ managerId: managerA.id })
        .expect(200);
      managerALeadId = unassignedLeadId;
    });

    it('a MANAGER creating a lead is auto-assigned to themselves', async () => {
      const created = bodyOf<{ assignedManagerId: string | null }>(
        await request(app.getHttpServer())
          .post('/leads')
          .set(...authHeader(managerA.accessToken))
          .send({ fullName: 'Self-created lead' })
          .expect(201),
      );
      expect(created.assignedManagerId).toBe(managerA.id);
    });

    it("managerB cannot see managerA's assigned lead in the list", async () => {
      const response = await request(app.getHttpServer())
        .get('/leads')
        .set(...authHeader(managerB.accessToken))
        .expect(200);
      const ids = (response.body as { id: string }[]).map((l) => l.id);
      expect(ids).not.toContain(managerALeadId);
    });

    it("managerB gets 404 (not 403) fetching managerA's lead directly", async () => {
      await request(app.getHttpServer())
        .get(`/leads/${managerALeadId}`)
        .set(...authHeader(managerB.accessToken))
        .expect(404);
    });

    it('managerA can see and read their own assigned lead', async () => {
      await request(app.getHttpServer())
        .get(`/leads/${managerALeadId}`)
        .set(...authHeader(managerA.accessToken))
        .expect(200);
    });

    it('MANAGER cannot assign leads (403) — OWNER-only', async () => {
      await request(app.getHttpServer())
        .patch(`/leads/${managerALeadId}/assign`)
        .set(...authHeader(managerA.accessToken))
        .send({ managerId: managerB.id })
        .expect(403);
    });

    it('changing status away from NEW stamps firstResponseAt exactly once', async () => {
      const first = bodyOf<{ firstResponseAt: string | null }>(
        await request(app.getHttpServer())
          .patch(`/leads/${managerALeadId}/status`)
          .set(...authHeader(managerA.accessToken))
          .send({ status: 'CONTACTED' })
          .expect(200),
      );
      expect(first.firstResponseAt).not.toBeNull();
      const firstResponseAt = first.firstResponseAt;

      const second = bodyOf<{ firstResponseAt: string | null }>(
        await request(app.getHttpServer())
          .patch(`/leads/${managerALeadId}/status`)
          .set(...authHeader(managerA.accessToken))
          .send({ status: 'IN_DIALOGUE' })
          .expect(200),
      );
      expect(second.firstResponseAt).toBe(firstResponseAt);
    });
  });

  describe('Deal creation, stock, and commission snapshot', () => {
    let leadId: string;

    beforeAll(async () => {
      const lead = bodyOf<{ id: string }>(
        await request(app.getHttpServer())
          .post('/leads')
          .set(...authHeader(managerA.accessToken))
          .send({ fullName: 'Deal Buyer' })
          .expect(201),
      );
      leadId = lead.id;
    });

    it('rejects a deal with a discount above the acting MANAGER max discount (400)', async () => {
      // subtotal = 20000, managerA maxDiscountPercent = 5% => cap is 1000
      await request(app.getHttpServer())
        .post('/deals')
        .set(...authHeader(managerA.accessToken))
        .send({
          leadId,
          warehouseId,
          items: [{ productId, quantity: 1 }],
          discount: 5000,
        })
        .expect(400);
    });

    it('creates a deal, decrements stock, and snapshots the manager commission at creation time', async () => {
      const before = await request(app.getHttpServer())
        .get(`/warehouses/${warehouseId}/stock`)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
      const stockBefore = (before.body as { productId: string; quantity: number }[]).find(
        (s) => s.productId === productId,
      )!.quantity;

      const deal = bodyOf<{
        totalAmount: string;
        commissionPercentSnap: string;
        commissionAmount: string;
        status: string;
      }>(
        await request(app.getHttpServer())
          .post('/deals')
          .set(...authHeader(managerA.accessToken))
          .send({
            leadId,
            warehouseId,
            items: [{ productId, quantity: 2 }],
          })
          .expect(201),
      );

      expect(deal.totalAmount).toBe('40000');
      // managerA commissionPercent = 10% of 40000 = 4000, fixed at creation.
      expect(deal.commissionPercentSnap).toBe('10');
      expect(deal.commissionAmount).toBe('4000');
      expect(deal.status).toBe('NEW');

      const after = await request(app.getHttpServer())
        .get(`/warehouses/${warehouseId}/stock`)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
      const stockAfter = (after.body as { productId: string; quantity: number }[]).find(
        (s) => s.productId === productId,
      )!.quantity;
      expect(stockAfter).toBe(stockBefore - 2);
    });

    it('rejects a deal that would oversell remaining stock (409, stock untouched)', async () => {
      const before = await request(app.getHttpServer())
        .get(`/warehouses/${warehouseId}/stock`)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
      const stockBefore = (before.body as { productId: string; quantity: number }[]).find(
        (s) => s.productId === productId,
      )!.quantity;

      await request(app.getHttpServer())
        .post('/deals')
        .set(...authHeader(managerA.accessToken))
        .send({
          leadId,
          warehouseId,
          items: [{ productId, quantity: stockBefore + 1 }],
        })
        .expect(409);

      const after = await request(app.getHttpServer())
        .get(`/warehouses/${warehouseId}/stock`)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
      const stockAfter = (after.body as { productId: string; quantity: number }[]).find(
        (s) => s.productId === productId,
      )!.quantity;
      expect(stockAfter).toBe(stockBefore);
    });

    it("managerB cannot see or fetch managerA's deal (list excludes it, direct GET 404)", async () => {
      const list = await request(app.getHttpServer())
        .get('/deals')
        .set(...authHeader(managerB.accessToken))
        .expect(200);
      const dealsFromLead = (list.body as { leadId: string }[]).filter((d) => d.leadId === leadId);
      expect(dealsFromLead).toHaveLength(0);
    });

    it('rejects an invalid status transition (NEW -> COMPLETED directly) with 400', async () => {
      const list = await request(app.getHttpServer())
        .get('/deals')
        .set(...authHeader(managerA.accessToken))
        .expect(200);
      const deal = (list.body as { id: string; leadId: string; status: string }[]).find(
        (d) => d.leadId === leadId && d.status === 'NEW',
      )!;

      await request(app.getHttpServer())
        .patch(`/deals/${deal.id}/status`)
        .set(...authHeader(managerA.accessToken))
        .send({ status: 'COMPLETED' })
        .expect(400);
    });

    it('CANCELLED restores stock exactly (valid transition path NEW -> WAITING_PAYMENT -> CANCELLED)', async () => {
      const list = await request(app.getHttpServer())
        .get('/deals')
        .set(...authHeader(managerA.accessToken))
        .expect(200);
      const deal = (list.body as { id: string; leadId: string; status: string }[]).find(
        (d) => d.leadId === leadId && d.status === 'NEW',
      )!;

      const stockBeforeCancel = await request(app.getHttpServer())
        .get(`/warehouses/${warehouseId}/stock`)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
      const qtyBefore = (stockBeforeCancel.body as { productId: string; quantity: number }[]).find(
        (s) => s.productId === productId,
      )!.quantity;

      await request(app.getHttpServer())
        .patch(`/deals/${deal.id}/status`)
        .set(...authHeader(managerA.accessToken))
        .send({ status: 'WAITING_PAYMENT' })
        .expect(200);

      const cancelled = bodyOf<{ status: string; closedAt: string | null }>(
        await request(app.getHttpServer())
          .patch(`/deals/${deal.id}/status`)
          .set(...authHeader(managerA.accessToken))
          .send({ status: 'CANCELLED' })
          .expect(200),
      );
      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.closedAt).not.toBeNull();

      const stockAfterCancel = await request(app.getHttpServer())
        .get(`/warehouses/${warehouseId}/stock`)
        .set(...authHeader(tenant.owner.accessToken))
        .expect(200);
      const qtyAfter = (stockAfterCancel.body as { productId: string; quantity: number }[]).find(
        (s) => s.productId === productId,
      )!.quantity;
      // The deal reserved 2 units — cancelling must give back exactly those 2.
      expect(qtyAfter).toBe(qtyBefore + 2);
    });

    it('rejects any further transition out of a terminal CANCELLED status (400)', async () => {
      const list = await request(app.getHttpServer())
        .get('/deals')
        .set(...authHeader(managerA.accessToken))
        .expect(200);
      const deal = (list.body as { id: string; leadId: string; status: string }[]).find(
        (d) => d.leadId === leadId && d.status === 'CANCELLED',
      )!;

      await request(app.getHttpServer())
        .patch(`/deals/${deal.id}/status`)
        .set(...authHeader(managerA.accessToken))
        .send({ status: 'PAID' })
        .expect(400);
    });
  });
});
