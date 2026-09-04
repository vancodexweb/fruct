import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { generateSecureToken } from '../common/security/generate-secure-token';
import { hashPassword } from '../common/security/password.util';
import { MailQueueService } from '../mailer/mail-queue.service';
import { MailTemplate } from '../mailer/mailer.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

const GENERATED_PASSWORD_BYTE_LENGTH = 16;

@Injectable()
export class UsersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly mailQueue: MailQueueService,
    private readonly currentTenant: CurrentTenantService,
  ) {}

  async createManager(dto: CreateUserDto): Promise<UserResponseDto> {
    const passwordWasGenerated = !dto.password;
    const password = dto.password ?? generateSecureToken(GENERATED_PASSWORD_BYTE_LENGTH);
    const passwordHash = await hashPassword(password);

    const user = await this.prisma.user.create({
      data: {
        // Explicit, even though the tenant Prisma extension would overwrite
        // it regardless — this satisfies Prisma's generated input types
        // with the exact value the extension is guaranteed to use.
        tenantId: this.currentTenant.tenantId,
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        role: Role.MANAGER, // hardcoded: this endpoint can never create another OWNER
        commissionPercent: dto.commissionPercent,
        baseSalary: dto.baseSalary,
        maxDiscountPercent: dto.maxDiscountPercent,
        mustChangePassword: true,
      },
    });

    // Only the auto-generated case emails credentials: if the OWNER chose the
    // password themselves, they're responsible for handing it to the manager
    // — we don't email a password the OWNER may have deliberately kept
    // off of email (e.g. read it to the manager over the phone).
    if (passwordWasGenerated) {
      await this.mailQueue.enqueue({
        tenantId: user.tenantId,
        userId: user.id,
        to: user.email,
        subject: 'Доступ к CRM создан',
        template: MailTemplate.CREDENTIALS_ISSUED,
        context: {
          fullName: user.fullName,
          email: user.email,
          temporaryPassword: password,
          roleLabel: 'менеджера',
        },
      });
    }

    return UserResponseDto.fromEntity(user);
  }

  async listManagers(): Promise<UserResponseDto[]> {
    const managers = await this.prisma.user.findMany({
      where: { role: Role.MANAGER },
      orderBy: { createdAt: 'asc' },
    });
    return managers.map(UserResponseDto.fromEntity);
  }

  async updateManager(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.findManagerOrThrow(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        commissionPercent: dto.commissionPercent,
        baseSalary: dto.baseSalary,
        maxDiscountPercent: dto.maxDiscountPercent,
      },
    });
    return UserResponseDto.fromEntity(updated);
  }

  async blockManager(id: string): Promise<UserResponseDto> {
    await this.findManagerOrThrow(id);
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.revokeAllRefreshTokens(id);
    return UserResponseDto.fromEntity(updated);
  }

  async unblockManager(id: string): Promise<UserResponseDto> {
    await this.findManagerOrThrow(id);
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive: true } });
    return UserResponseDto.fromEntity(updated);
  }

  /**
   * Soft delete: Deal/Lead/Payout keep referencing this user, so the row
   * can never actually be removed. isActive=false blocks login (checked in
   * AuthService and again on every request in JwtStrategy), the email is
   * anonymized so the address becomes free for reuse, and every existing
   * session is killed immediately.
   */
  async deleteManager(id: string): Promise<void> {
    await this.findManagerOrThrow(id);
    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        email: `deleted-${id}@removed.invalid`,
        telegramChatId: null,
      },
    });
    await this.revokeAllRefreshTokens(id);
  }

  async getOwnProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return UserResponseDto.fromEntity(user);
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto): Promise<UserResponseDto> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName },
    });
    return UserResponseDto.fromEntity(updated);
  }

  /** OWNER-only endpoints operate on managers only — never on another OWNER's account. */
  private async findManagerOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== Role.MANAGER) {
      throw new NotFoundException('Менеджер не найден.');
    }
    return user;
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
