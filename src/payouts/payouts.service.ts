import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Payout, PayoutStatus, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { CurrentTenantService } from '../common/prisma/current-tenant.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { COMMISSIONABLE_DEAL_STATUSES } from '../deals/deal-status-transitions';
import { MailQueueService } from '../mailer/mail-queue.service';
import { MailTemplate, PayoutStatementDealLine } from '../mailer/mailer.types';
import { ApprovePayoutDto } from './dto/approve-payout.dto';
import { ListPayoutsQueryDto } from './dto/list-payouts-query.dto';
import { PayoutPeriodDto } from './dto/payout-period.dto';
import { PayoutPreviewDto } from './dto/payout-preview.dto';
import { PayoutResponseDto } from './dto/payout-response.dto';
import { UpdatePayoutDto } from './dto/update-payout.dto';

interface ManagerPayoutCalc {
  managerId: string;
  managerFullName: string;
  managerEmail: string;
  baseSalary: Decimal;
  totalCommission: Decimal;
  totalPayout: Decimal;
  deals: { id: string; createdAt: Date; totalAmount: Decimal; commissionAmount: Decimal }[];
}

const RU_DATE = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

@Injectable()
export class PayoutsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly currentTenant: CurrentTenantService,
    private readonly mailQueue: MailQueueService,
  ) {}

  /** Computed on the fly, never written to the database — see spec: "preview за период без записи в БД". */
  async preview(dto: PayoutPeriodDto): Promise<PayoutPreviewDto[]> {
    const calcs = await this.calculateForPeriod(dto);
    return calcs.map((calc) => this.toPreviewDto(calc));
  }

  /** Same calculation as preview(), but persists one Payout row (status DRAFT) per manager and links their deals to it. */
  async generate(dto: PayoutPeriodDto): Promise<PayoutResponseDto[]> {
    const calcs = await this.calculateForPeriod(dto);
    const tenantId = this.currentTenant.tenantId;
    const created: Payout[] = [];

    for (const calc of calcs) {
      if (calc.totalPayout.isZero()) {
        // Nothing to pay this manager for this period — don't create an empty DRAFT row.
        continue;
      }

      const payout = await this.prisma.$transaction(async (tx) => {
        const row = await tx.payout.create({
          data: {
            tenantId,
            managerId: calc.managerId,
            periodStart: new Date(dto.periodStart),
            periodEnd: new Date(dto.periodEnd),
            baseSalary: calc.baseSalary,
            totalCommission: calc.totalCommission,
            totalPayout: calc.totalPayout,
            status: PayoutStatus.DRAFT,
          },
        });
        if (calc.deals.length > 0) {
          await tx.deal.updateMany({
            where: { id: { in: calc.deals.map((deal) => deal.id) } },
            data: { payoutId: row.id },
          });
        }
        return row;
      });
      created.push(payout);
    }

    return created.map(PayoutResponseDto.fromEntity);
  }

  async findAll(
    query: ListPayoutsQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<PayoutResponseDto[]> {
    const managerId = currentUser.role === Role.MANAGER ? currentUser.id : query.managerId;
    const payouts = await this.prisma.payout.findMany({
      where: { status: query.status, managerId },
      orderBy: { periodStart: 'desc' },
    });
    return payouts.map(PayoutResponseDto.fromEntity);
  }

  async findOne(id: string, currentUser: AuthenticatedUser): Promise<PayoutResponseDto> {
    const payout = await this.findOrThrow(id, currentUser);
    return PayoutResponseDto.fromEntity(payout);
  }

  /** "ручная корректировка перед утверждением" — only while still DRAFT. */
  async update(id: string, dto: UpdatePayoutDto): Promise<PayoutResponseDto> {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) {
      throw new NotFoundException('Выплата не найдена.');
    }
    if (payout.status !== PayoutStatus.DRAFT) {
      throw new ConflictException('Корректировать можно только выплату в статусе DRAFT.');
    }

    const baseSalary =
      dto.baseSalary !== undefined ? new Decimal(dto.baseSalary) : payout.baseSalary;
    const totalCommission =
      dto.totalCommission !== undefined ? new Decimal(dto.totalCommission) : payout.totalCommission;
    const totalPayout =
      dto.totalPayout !== undefined
        ? new Decimal(dto.totalPayout)
        : baseSalary.plus(totalCommission);

    const updated = await this.prisma.payout.update({
      where: { id },
      data: { baseSalary, totalCommission, totalPayout },
    });
    return PayoutResponseDto.fromEntity(updated);
  }

  async approve(id: string, dto: ApprovePayoutDto): Promise<PayoutResponseDto> {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) {
      throw new NotFoundException('Выплата не найдена.');
    }
    if (payout.status !== PayoutStatus.DRAFT) {
      throw new ConflictException('В APPROVED можно перевести только выплату в статусе DRAFT.');
    }

    const updated = await this.prisma.payout.update({
      where: { id },
      data: { status: PayoutStatus.APPROVED, approvedAt: new Date() },
    });

    if (dto.notifyManager) {
      await this.enqueueStatusChangedEmail(updated, 'подтверждена');
    }
    return PayoutResponseDto.fromEntity(updated);
  }

  async markPaid(id: string, dto: ApprovePayoutDto): Promise<PayoutResponseDto> {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) {
      throw new NotFoundException('Выплата не найдена.');
    }
    if (payout.status !== PayoutStatus.APPROVED) {
      throw new ConflictException('В PAID можно перевести только выплату в статусе APPROVED.');
    }

    const updated = await this.prisma.payout.update({
      where: { id },
      data: { status: PayoutStatus.PAID },
    });

    if (dto.notifyManager) {
      await this.enqueueStatusChangedEmail(updated, 'выплачена');
    }
    return PayoutResponseDto.fromEntity(updated);
  }

  async sendEmail(id: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout) {
      throw new NotFoundException('Выплата не найдена.');
    }
    await this.enqueueStatementEmail(payout);
    await this.prisma.payout.update({ where: { id }, data: { emailSentAt: new Date() } });
  }

  async sendBulk(dto: PayoutPeriodDto): Promise<{ queuedCount: number }> {
    const payouts = await this.prisma.payout.findMany({
      where: { periodStart: new Date(dto.periodStart), periodEnd: new Date(dto.periodEnd) },
    });
    for (const payout of payouts) {
      await this.enqueueStatementEmail(payout);
    }
    if (payouts.length > 0) {
      await this.prisma.payout.updateMany({
        where: { id: { in: payouts.map((payout) => payout.id) } },
        data: { emailSentAt: new Date() },
      });
    }
    return { queuedCount: payouts.length };
  }

  private async calculateForPeriod(dto: PayoutPeriodDto): Promise<ManagerPayoutCalc[]> {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    const managers = await this.prisma.user.findMany({
      where: { role: Role.MANAGER, id: dto.managerId },
    });

    const results: ManagerPayoutCalc[] = [];
    for (const manager of managers) {
      const deals = await this.prisma.deal.findMany({
        where: {
          managerId: manager.id,
          status: { in: [...COMMISSIONABLE_DEAL_STATUSES] },
          createdAt: { gte: periodStart, lte: periodEnd },
          // Never double-count a deal already claimed by an earlier payout
          // for an overlapping period.
          payoutId: null,
        },
        orderBy: { createdAt: 'asc' },
      });

      const totalCommission = deals.reduce(
        (sum, deal) => sum.plus(deal.commissionAmount),
        new Decimal(0),
      );
      const baseSalary = new Decimal(manager.baseSalary);

      results.push({
        managerId: manager.id,
        managerFullName: manager.fullName,
        managerEmail: manager.email,
        baseSalary,
        totalCommission,
        totalPayout: baseSalary.plus(totalCommission),
        deals: deals.map((deal) => ({
          id: deal.id,
          createdAt: deal.createdAt,
          totalAmount: new Decimal(deal.totalAmount),
          commissionAmount: new Decimal(deal.commissionAmount),
        })),
      });
    }
    return results;
  }

  private toPreviewDto(calc: ManagerPayoutCalc): PayoutPreviewDto {
    return {
      managerId: calc.managerId,
      managerFullName: calc.managerFullName,
      baseSalary: calc.baseSalary.toString(),
      totalCommission: calc.totalCommission.toString(),
      totalPayout: calc.totalPayout.toString(),
      deals: calc.deals.map((deal) => ({
        dealId: deal.id,
        createdAt: deal.createdAt,
        totalAmount: deal.totalAmount.toString(),
        commissionAmount: deal.commissionAmount.toString(),
      })),
    };
  }

  private async enqueueStatementEmail(payout: Payout): Promise<void> {
    const manager = await this.prisma.user.findUniqueOrThrow({ where: { id: payout.managerId } });
    const deals = await this.prisma.deal.findMany({
      where: { payoutId: payout.id },
      orderBy: { createdAt: 'asc' },
    });

    const dealLines: PayoutStatementDealLine[] = deals.map((deal) => ({
      date: RU_DATE.format(deal.createdAt),
      totalAmount: deal.totalAmount.toString(),
      commissionAmount: deal.commissionAmount.toString(),
    }));

    await this.mailQueue.enqueue({
      tenantId: payout.tenantId,
      userId: manager.id,
      to: manager.email,
      subject: `Расчётный лист за период ${RU_DATE.format(payout.periodStart)} — ${RU_DATE.format(payout.periodEnd)}`,
      template: MailTemplate.PAYOUT_STATEMENT,
      context: {
        fullName: manager.fullName,
        periodStart: RU_DATE.format(payout.periodStart),
        periodEnd: RU_DATE.format(payout.periodEnd),
        baseSalary: payout.baseSalary.toString(),
        totalCommission: payout.totalCommission.toString(),
        totalPayout: payout.totalPayout.toString(),
        deals: dealLines,
      },
    });
  }

  private async enqueueStatusChangedEmail(payout: Payout, statusLabel: string): Promise<void> {
    const manager = await this.prisma.user.findUniqueOrThrow({ where: { id: payout.managerId } });
    await this.mailQueue.enqueue({
      tenantId: payout.tenantId,
      userId: manager.id,
      to: manager.email,
      subject: `Ваша выплата за период ${RU_DATE.format(payout.periodStart)} — ${RU_DATE.format(payout.periodEnd)} ${statusLabel}`,
      template: MailTemplate.PAYOUT_STATUS_CHANGED,
      context: {
        fullName: manager.fullName,
        periodStart: RU_DATE.format(payout.periodStart),
        periodEnd: RU_DATE.format(payout.periodEnd),
        totalPayout: payout.totalPayout.toString(),
        statusLabel,
      },
    });
  }

  private async findOrThrow(id: string, currentUser: AuthenticatedUser): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({ where: { id } });
    if (!payout || (currentUser.role === Role.MANAGER && payout.managerId !== currentUser.id)) {
      throw new NotFoundException('Выплата не найдена.');
    }
    return payout;
  }
}
