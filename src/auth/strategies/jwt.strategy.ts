import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessTokenPayload, AuthenticatedUser } from '../../common/types/jwt-payload.type';

/**
 * Validates access tokens. Runs on every authenticated request, so it
 * re-checks the user is still active on every call rather than trusting the
 * token's claims blindly — otherwise blocking a manager wouldn't take
 * effect until their access token naturally expired.
 *
 * Uses the raw PrismaService deliberately: this runs before TenantGuard, so
 * there is no tenant CLS context yet for the tenant-scoped client to use.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Учётная запись недоступна.');
    }
    return { id: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
  }
}
