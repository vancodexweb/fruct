import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The raw, UNSCOPED Prisma client — no tenant filtering is applied to
 * queries made through this class directly.
 *
 * Inject this only where tenant scoping genuinely doesn't apply yet, e.g.
 * auth flows that run before a tenant is known (login, forgot-password).
 * Everywhere else, inject TENANT_PRISMA (see prisma.module.ts) so the
 * tenant Prisma extension protects you automatically.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected to the database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
