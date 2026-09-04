import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../types/cls-store.type';
import { TENANT_SCOPED_MODELS } from './tenant-scoped-models';

const WHERE_SCOPED_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Prisma Client Extension enforcing tenant isolation at the query layer.
 *
 * For every model listed in TENANT_SCOPED_MODELS, this rewrites the query
 * arguments so that `tenantId` always comes from the current request's CLS
 * context (set by TenantGuard for HTTP, or TenantContextService.run() for
 * background jobs) — never from whatever the caller passed in. This is what
 * guarantees a crafted request body can't smuggle a different tenantId into
 * a `where`/`data` clause: DTOs never even declare a tenantId field, and
 * even if one leaked through, this extension overwrites it unconditionally.
 *
 * If no tenant context is present, every scoped query throws rather than
 * silently running unscoped — a missing TenantGuard is a bug, not a reason
 * to leak cross-tenant data.
 */
export function tenantScopingExtension(cls: ClsService<AppClsStore>) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'tenant-scoping',
      query: {
        $allModels: {
          // Prisma's extension typings can't express "different arg shape per
          // operation" generically, so this boundary is deliberately `any` —
          // see the doc comment above for why that's the right tradeoff here.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async $allOperations({ model, operation, args, query }: any) {
            if (!model || !TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) {
              return query(args);
            }

            const tenantId = cls.get('tenantId');
            if (!tenantId) {
              throw new Error(
                `Попытка обратиться к ${model}.${operation} без контекста тенанта. ` +
                  'Убедитесь, что запрос прошёл через TenantGuard (для HTTP) или ' +
                  'TenantContextService.run() (для фоновых задач/BullMQ воркеров).',
              );
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scopedArgs: Record<string, any> = { ...(args ?? {}) };

            if (operation === 'create') {
              scopedArgs.data = { ...(scopedArgs.data ?? {}), tenantId };
            } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
              const data = scopedArgs.data;
              scopedArgs.data = Array.isArray(data)
                ? data.map((item) => ({ ...item, tenantId }))
                : { ...(data ?? {}), tenantId };
            } else if (operation === 'upsert') {
              scopedArgs.where = { ...(scopedArgs.where ?? {}), tenantId };
              scopedArgs.create = { ...(scopedArgs.create ?? {}), tenantId };
              scopedArgs.update = { ...(scopedArgs.update ?? {}), tenantId };
            } else if (WHERE_SCOPED_OPERATIONS.has(operation)) {
              scopedArgs.where = { ...(scopedArgs.where ?? {}), tenantId };
            }

            return query(scopedArgs);
          },
        },
      },
    }),
  );
}
