import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MailQueueService } from './mail-queue.service';
import { MailProcessor } from './mail.processor';
import { MAIL_QUEUE_NAME, MAILER_SERVICE } from './mailer.constants';
import { NodemailerMailerService } from './nodemailer-mailer.service';

@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE_NAME })],
  providers: [
    { provide: MAILER_SERVICE, useClass: NodemailerMailerService },
    MailQueueService,
    MailProcessor,
  ],
  exports: [MailQueueService],
})
export class MailerModule {}
