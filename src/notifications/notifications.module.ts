import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { NOTIFICATIONS_QUEUE_NAME, TELEGRAM_SERVICE } from './notifications.constants';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { TelegrafTelegramService } from './telegraf-telegram.service';

@Module({
  imports: [MailerModule, BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE_NAME })],
  controllers: [NotificationsController],
  providers: [
    { provide: TELEGRAM_SERVICE, useClass: TelegrafTelegramService },
    NotificationsService,
    NotificationsProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
