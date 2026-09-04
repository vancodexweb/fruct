import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DealStatus, NotificationType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Job, Queue } from 'bullmq';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { TenantContextService } from '../common/prisma/tenant-context.service';
import { COMMISSIONABLE_DEAL_STATUSES } from '../deals/deal-status-transitions';
import { MailTemplate } from '../mailer/mailer.types';
import {
  DAILY_DIGEST_CRON_PATTERN,
  DAILY_DIGEST_JOB_NAME,
  DAILY_DIGEST_SCHEDULER_ID,
  NOTIFICATIONS_QUEUE_NAME,
  SLA_CHECK_INTERVAL_MS,
  SLA_CHECK_JOB_NAME,
  SLA_CHECK_SCHEDULER_ID,
} from './notifications.constants';
import { NotificationsService } from './notifications.service';

interface BreachingLeadRow {
  id: string;
  tenantId: string;
  assignedManagerId: string;
  fullName: string | null;
  phone: string | null;
}

const RU_DATE = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const COMMISSIONABLE_STATUS_LIST = [...COMMISSIONABLE_DEAL_STATUSES];

/**
 * Two BullMQ repeatable jobs, registered once via upsertJobScheduler
 * (idempotent across restarts/redeploys, unlike the older queue.add +
 * {repeat} pattern which could accumulate duplicate schedulers):
 *  - sla-check, every 60s: leads with no firstResponseAt older than the
 *    tenant's slaMinutes.
 *  - daily-digest, 08:00 UTC: per-tenant summary to every OWNER.
 *
 * Both run outside any HTTP request, across every tenant — there is no
 * ambient CLS context, so each tenant's work is wrapped in
 * TenantContextService.run() before touching the tenant-scoped Prisma
 * client, exactly like MailProcessor.
 *
 * Simplification: daily-digest fires at a single fixed UTC hour rather than
 * each tenant's own local midnight+N (Tenant.timezone). Getting that exactly
 * right needs a per-tenant scheduler or an hourly "is it 8am there yet"
 * check; for a single-tenant-per-deployment product (see README) the extra
 * complexity isn't worth it yet — flagging it here rather than pretending
 * this is timezone-aware.
 */
@Injectable()
@Processor(NOTIFICATIONS_QUEUE_NAME)
export class NotificationsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE_NAME) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    @Inject(TENANT_PRISMA) private readonly tenantPrisma: TenantPrismaClient,
    private readonly tenantContext: TenantContextService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SLA_CHECK_SCHEDULER_ID,
      { every: SLA_CHECK_INTERVAL_MS },
      { name: SLA_CHECK_JOB_NAME },
    );
    await this.queue.upsertJobScheduler(
      DAILY_DIGEST_SCHEDULER_ID,
      { pattern: DAILY_DIGEST_CRON_PATTERN },
      { name: DAILY_DIGEST_JOB_NAME },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name === SLA_CHECK_JOB_NAME) {
      return this.runSlaCheck();
    }
    if (job.name === DAILY_DIGEST_JOB_NAME) {
      return this.runDailyDigest();
    }
    this.logger.warn(`Неизвестное имя задания в очереди уведомлений: ${job.name}`);
  }

  private async runSlaCheck(): Promise<void> {
    // Cross-tenant by nature (this IS the tenant boundary check), so this
    // one query legitimately runs on the raw, unscoped client — see
    // PrismaService's doc comment.
    const breachingLeads = await this.prisma.$queryRaw<BreachingLeadRow[]>(Prisma.sql`
      SELECT l.id, l."tenantId", l."assignedManagerId", l."fullName", l.phone
      FROM leads l
      JOIN tenants t ON t.id = l."tenantId"
      WHERE l."firstResponseAt" IS NULL
        AND l."assignedManagerId" IS NOT NULL
        AND l."createdAt" < now() - (t."slaMinutes" * interval '1 minute')
    `);

    for (const lead of breachingLeads) {
      await this.tenantContext.run({ tenantId: lead.tenantId }, async () => {
        const { tenantPrisma } = this;

        // One notification per lead, ever — without this check the 1-minute
        // cron would re-notify the same still-open breach every cycle.
        const alreadyNotified = await tenantPrisma.notification.findFirst({
          where: {
            type: NotificationType.SLA_BREACH,
            payload: { path: ['leadId'], equals: lead.id },
          },
        });
        if (alreadyNotified) {
          return;
        }

        const leadName = lead.fullName ?? 'без имени';
        const leadPhone = lead.phone ?? 'телефон не указан';

        await this.notificationsService.notify({
          userId: lead.assignedManagerId,
          tenantId: lead.tenantId,
          type: NotificationType.SLA_BREACH,
          payload: { leadId: lead.id, leadFullName: leadName, leadPhone },
          telegramText: `⏱ Просрочен ответ клиенту ${leadName} (${leadPhone}) — превышен SLA.`,
          email: {
            subject: 'Просрочен ответ клиенту',
            template: MailTemplate.SLA_BREACH,
            context: { leadFullName: leadName, leadPhone, minutesOverdue: 0 },
          },
        });
      });
    }
  }

  private async runDailyDigest(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({ where: { isActive: true } });
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    for (const tenant of tenants) {
      await this.tenantContext.run({ tenantId: tenant.id }, async () => {
        const { tenantPrisma } = this;

        const owners = await tenantPrisma.user.findMany({
          where: { role: 'OWNER', isActive: true },
        });
        if (owners.length === 0) {
          return;
        }

        const newLeadsCount = await tenantPrisma.lead.count({
          where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        });
        const dealsClosedCount = await tenantPrisma.deal.count({
          where: { status: DealStatus.COMPLETED, closedAt: { gte: startOfDay, lte: endOfDay } },
        });
        const revenueAgg = await tenantPrisma.deal.aggregate({
          where: {
            status: { in: COMMISSIONABLE_STATUS_LIST },
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
          _sum: { totalAmount: true },
        });
        const slaBreachesCount = await tenantPrisma.notification.count({
          where: {
            type: NotificationType.SLA_BREACH,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
        });
        const revenueToday = (revenueAgg._sum.totalAmount ?? new Decimal(0)).toString();
        const dateLabel = RU_DATE.format(now);

        for (const owner of owners) {
          await this.notificationsService.notify({
            userId: owner.id,
            tenantId: tenant.id,
            type: NotificationType.DAILY_DIGEST,
            payload: { newLeadsCount, dealsClosedCount, revenueToday, slaBreachesCount },
            telegramText:
              `📊 Дайджест «${tenant.name}» за ${dateLabel}\n` +
              `Новых лидов: ${newLeadsCount}\nЗакрыто сделок: ${dealsClosedCount}\n` +
              `Выручка: ${revenueToday} ₽\nПросрочек SLA: ${slaBreachesCount}`,
            email: {
              subject: `Дневной дайджест — ${dateLabel}`,
              template: MailTemplate.DAILY_DIGEST,
              context: {
                tenantName: tenant.name,
                date: dateLabel,
                newLeadsCount,
                dealsClosedCount,
                revenueToday,
                slaBreachesCount,
              },
            },
          });
        }
      });
    }
  }
}
