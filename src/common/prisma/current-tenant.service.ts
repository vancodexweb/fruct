import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../types/cls-store.type';

/**
 * Reads the current request's tenantId out of CLS. The tenant Prisma
 * extension already enforces isolation on every scoped query at runtime —
 * this exists purely so service code can satisfy Prisma's generated input
 * types (e.g. `user.create({ data: { tenantId, ... } })`) with the exact
 * same value the extension would inject anyway, instead of a placeholder.
 */
@Injectable()
export class CurrentTenantService {
  constructor(private readonly cls: ClsService<AppClsStore>) {}

  get tenantId(): string {
    const tenantId = this.cls.get('tenantId');
    if (!tenantId) {
      throw new Error(
        'CurrentTenantService использован вне контекста тенанта — запрос не прошёл через TenantGuard.',
      );
    }
    return tenantId;
  }
}
