import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { AppClsStore } from '../types/cls-store.type';

/**
 * Establishes the tenant CLS context for code paths that don't go through
 * an HTTP request (and therefore never pass through TenantGuard) — the
 * BullMQ mail processor and the SLA/notifications cron are the current
 * examples. The tenant-scoped Prisma extension refuses to run without this.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  run<T>(context: { tenantId: string; userId?: string; role?: Role }, callback: () => T): T {
    return this.cls.runWith(
      {
        tenantId: context.tenantId,
        userId: context.userId,
        role: context.role,
      },
      callback,
    );
  }
}
