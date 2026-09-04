import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppClsStore } from '../types/cls-store.type';
import { AuthenticatedUser } from '../types/jwt-payload.type';

/**
 * Runs after JwtAuthGuard. Copies the authenticated user's tenantId/userId/role
 * into the request's CLS store, which is what the tenant Prisma extension
 * (common/prisma/tenant.extension.ts) reads to scope every query. This is the
 * single point where "which tenant is this request for" gets established —
 * nothing downstream (DTOs included) can override it.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      // JwtAuthGuard should already have rejected the request in this case.
      return false;
    }

    this.cls.set('tenantId', user.tenantId);
    this.cls.set('userId', user.id);
    this.cls.set('role', user.role);
    return true;
  }
}
