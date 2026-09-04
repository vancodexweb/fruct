import { Global, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../types/cls-store.type';
import { PrismaService } from './prisma.service';
import { TENANT_PRISMA } from './prisma.constants';
import { createTenantPrismaClient } from './create-tenant-prisma-client';
import { CurrentTenantService } from './current-tenant.service';
import { TenantContextService } from './tenant-context.service';

/**
 * Global module exposing two Prisma clients:
 *  - PrismaService (the raw class)  — unscoped, use sparingly and deliberately.
 *  - TENANT_PRISMA (inject token)   — tenant-scoped, use this by default.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    CurrentTenantService,
    {
      provide: TENANT_PRISMA,
      useFactory: (prisma: PrismaService, cls: ClsService<AppClsStore>) =>
        createTenantPrismaClient(prisma, cls),
      inject: [PrismaService, ClsService],
    },
  ],
  exports: [PrismaService, TENANT_PRISMA, TenantContextService, CurrentTenantService],
})
export class PrismaModule {}
