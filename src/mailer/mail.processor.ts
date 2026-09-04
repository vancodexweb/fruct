import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { TenantContextService } from '../common/prisma/tenant-context.service';
import { MAIL_QUEUE_NAME, MAILER_SERVICE } from './mailer.constants';
import { renderMailTemplate } from './mail-template.renderer';
import { MailerService } from './mailer.service.interface';
import { MailJobPayload } from './mailer.types';

/**
 * Consumer side of the mail queue: renders the template and hands it to
 * MailerService. A send failure (SMTP down, rejected recipient, ...) is
 * logged to ActivityLog with action='EMAIL_SEND_FAILED' — per spec this must
 * never fail the original HTTP request, which by this point has long since
 * returned "queued for delivery" to the caller.
 */
@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    @Inject(MAILER_SERVICE) private readonly mailer: MailerService,
    private readonly tenantContext: TenantContextService,
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
  ) {
    super();
  }

  async process(job: Job<MailJobPayload>): Promise<void> {
    const { tenantId, userId, to, subject, template, context } = job.data;

    await this.tenantContext.run({ tenantId, userId }, async () => {
      try {
        const rendered = renderMailTemplate(template, subject, to, context);
        await this.mailer.sendMail(rendered);
      } catch (error) {
        await this.logDeliveryFailure(tenantId, userId, to, template, error);
        throw error; // rethrow so BullMQ applies the queue's retry/backoff policy
      }
    });
  }

  private async logDeliveryFailure(
    tenantId: string,
    userId: string | undefined,
    to: string,
    template: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          // See CurrentTenantService's doc comment: explicit even though the
          // tenant extension would overwrite it, to satisfy Prisma's types.
          tenantId,
          userId,
          action: 'EMAIL_SEND_FAILED',
          entityType: 'Mail',
          metadata: {
            to,
            template,
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });
    } catch (logError) {
      this.logger.error(
        `Не удалось записать ActivityLog о сбое отправки письма на ${to}: ${
          logError instanceof Error ? logError.message : String(logError)
        }`,
      );
    }
  }
}
