import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MAIL_QUEUE_NAME } from './mailer.constants';
import { MailJobPayload, MailTemplate } from './mailer.types';

/**
 * Producer side of the mail queue. Every module that needs to send an email
 * (users, auth, payouts, notifications) depends on this, never on
 * MailerService directly — sending must never block the HTTP request that
 * triggered it (see MailProcessor for the consumer side).
 */
@Injectable()
export class MailQueueService {
  constructor(@InjectQueue(MAIL_QUEUE_NAME) private readonly queue: Queue<MailJobPayload>) {}

  async enqueue<T extends MailTemplate>(payload: MailJobPayload<T>): Promise<void> {
    await this.queue.add('send-mail', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    });
  }
}
