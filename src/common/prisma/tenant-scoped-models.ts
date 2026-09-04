import { Prisma } from '@prisma/client';

/**
 * Models that carry a `tenantId` column and therefore get it injected
 * automatically by the tenant Prisma extension (see tenant.extension.ts).
 *
 * Deliberately excluded (scoped indirectly through a parent instead):
 *  - Tenant            — this IS the tenant, nothing to scope it by.
 *  - RefreshToken       — scoped via userId (auth runs pre-tenant-context anyway).
 *  - PasswordResetToken — same as above.
 *  - Stock              — scoped via warehouseId/productId → tenant; the catalog
 *                          module must join through Warehouse/Product explicitly.
 *  - DealItem           — scoped via dealId → tenant; the deals module must
 *                          join through Deal explicitly.
 */
export const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  'User',
  'Category',
  'Product',
  'Warehouse',
  'DeliveryOption',
  'DeliveryQuote',
  'ScriptTemplate',
  'Lead',
  'Deal',
  'Payout',
  'Notification',
  'ActivityLog',
]);
