import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../types/cls-store.type';
import { PrismaService } from './prisma.service';
import { tenantScopingExtension } from './tenant.extension';

export function createTenantPrismaClient(prisma: PrismaService, cls: ClsService<AppClsStore>) {
  return prisma.$extends(tenantScopingExtension(cls));
}

/** Injected via the TENANT_PRISMA token — see prisma.module.ts. */
export type TenantPrismaClient = ReturnType<typeof createTenantPrismaClient>;
