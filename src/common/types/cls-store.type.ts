import { ClsStore } from 'nestjs-cls';
import { Role } from '@prisma/client';

/**
 * Per-request (or per-background-job) context carried via AsyncLocalStorage.
 * Populated by TenantGuard for HTTP requests, and by
 * TenantContextService.run() for BullMQ workers / the SLA cron.
 *
 * The Prisma tenant extension (see common/prisma/tenant.extension.ts) reads
 * `tenantId` from here to scope every query — this is the single source of
 * truth for "which tenant is this operation running for".
 */
export interface AppClsStore extends ClsStore {
  tenantId?: string;
  userId?: string;
  role?: Role;
}
