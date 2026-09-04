import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { asJwtExpiry } from '../common/config/jwt-duration.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/security/password.util';
import { generateSecureToken } from '../common/security/generate-secure-token';
import { hashToken, tokenHashMatches } from '../common/security/token-hash.util';
import { RefreshTokenPayload, AccessTokenPayload } from '../common/types/jwt-payload.type';
import { MailQueueService } from '../mailer/mail-queue.service';
import { MailTemplate } from '../mailer/mailer.types';
import { PASSWORD_RESET_TTL_MINUTES } from './auth.constants';
import { buildPasswordResetUrl } from './build-password-reset-url';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/**
 * Everything here runs BEFORE a tenant is known, by definition — so it
 * always uses the raw, unscoped PrismaService rather than the tenant-scoped
 * client. See prisma/tenant-scoped-models.ts and the JwtStrategy doc comment
 * for the same reasoning.
 *
 * KNOWN LIMITATION: User.email is unique per-tenant (@@unique([tenantId,
 * email])), not globally. login()/forgot-password() look a user up by email
 * alone with no tenant selector, which only produces a single unambiguous
 * match as long as each deployment serves one active tenant (the model this
 * product currently ships under — see the project README). If this ever
 * becomes a true multi-tenant-per-instance SaaS (several companies sharing
 * one deployment), login must be extended with an explicit tenant selector
 * (subdomain, slug, or similar) before that stops being safe.
 */
@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTokenTtl: string;
  private readonly refreshTokenTtl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailQueue: MailQueueService,
  ) {
    this.accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTokenTtl = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    this.refreshTokenTtl = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Неверный email или пароль.');
    }

    const passwordValid = await verifyPassword(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Неверный email или пароль.');
    }

    return this.issueTokenPair(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokensDto> {
    const payload = await this.verifyRefreshJwt(dto.refreshToken);

    const existingToken = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!existingToken) {
      throw new UnauthorizedException('Недействительный refresh-токен.');
    }

    if (existingToken.revokedAt) {
      // This token was already rotated (or explicitly revoked via logout).
      // Seeing it again means it leaked — kill every session for this user
      // rather than silently rejecting just this one request.
      await this.prisma.refreshToken.updateMany({
        where: { userId: existingToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Обнаружено повторное использование refresh-токена. Все сессии завершены — выполните вход заново.',
      );
    }

    if (existingToken.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Срок действия refresh-токена истёк.');
    }

    if (!tokenHashMatches(dto.refreshToken, existingToken.tokenHash)) {
      throw new UnauthorizedException('Недействительный refresh-токен.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: existingToken.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Учётная запись недоступна.');
    }

    await this.prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(user);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.verifyRefreshJwt(dto.refreshToken);
    } catch {
      // Already invalid/expired: logging out is idempotent, not an error.
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, isActive: true } });

    // Same response whether or not the user exists — never reveal which
    // emails are registered.
    if (!user) {
      return;
    }

    const rawToken = generateSecureToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt },
    });

    await this.mailQueue.enqueue({
      tenantId: user.tenantId,
      userId: user.id,
      to: user.email,
      subject: 'Сброс пароля',
      template: MailTemplate.PASSWORD_RESET,
      context: {
        fullName: user.fullName,
        resetUrl: buildPasswordResetUrl(this.config, rawToken),
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      },
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    // PasswordResetToken.tokenHash is a deterministic SHA-256 digest, so we
    // can search by it directly — see common/security/token-hash.util.ts.
    const candidateHash = hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash: candidateHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Ссылка для сброса пароля недействительна или устарела.');
    }

    const newPasswordHash = await hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Password compromise is exactly the scenario refresh-token rotation
      // exists for: invalidate every existing session immediately.
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokenPair(user: User): Promise<AuthTokensDto> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.accessSecret,
      expiresIn: asJwtExpiry(this.accessTokenTtl),
    });

    // Two-step so the refresh JWT can embed the DB row's own id as `jti`:
    // create a placeholder (unusable — empty hash, already-expired date),
    // sign the token referencing it, then fill in the real hash/expiry.
    // A crash between these two writes just leaves a dead, never-matching
    // row; nothing relies on this being atomic.
    const placeholder = await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: '', expiresAt: new Date(0) },
    });

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      jti: placeholder.id,
      tenantId: user.tenantId,
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: asJwtExpiry(this.refreshTokenTtl),
    });
    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);

    await this.prisma.refreshToken.update({
      where: { id: placeholder.id },
      data: { tokenHash: hashToken(refreshToken), expiresAt: new Date(decoded.exp * 1000) },
    });

    return new AuthTokensDto(accessToken, refreshToken);
  }

  private async verifyRefreshJwt(rawToken: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(rawToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Недействительный или истёкший refresh-токен.');
    }
  }
}
