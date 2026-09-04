import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { TenantPrismaClient } from '../common/prisma/create-tenant-prisma-client';
import { TENANT_PRISMA } from '../common/prisma/prisma.constants';
import { AuthenticatedUser } from '../common/types/jwt-payload.type';
import { MailQueueService } from '../mailer/mail-queue.service';
import { MailTemplate, MailTemplateContextMap } from '../mailer/mailer.types';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { TELEGRAM_SERVICE } from './notifications.constants';
import { TelegramService } from './telegram.interface';

interface NotifyParams<T extends MailTemplate> {
  userId: string;
  tenantId: string;
  type: NotificationType;
  payload: Prisma.InputJsonValue;
  telegramText: string;
  email: { subject: string; template: T; context: MailTemplateContextMap[T] };
}

/**
 * Single entry point for "tell this user something happened": always
 * records a Notification row, then tries Telegram first (if the user has
 * telegramChatId) and falls back to email — on a missing chatId, a missing
 * TELEGRAM_BOT_TOKEN, or any Telegram API failure alike. Per spec this is
 * how SLA_BREACH and DAILY_DIGEST reach a user; nothing about the fallback
 * is specific to just the "no chatId" case, a bot outage shouldn't lose a
 * notification either.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: TenantPrismaClient,
    private readonly mailQueue: MailQueueService,
    @Inject(TELEGRAM_SERVICE) private readonly telegramService: TelegramService,
  ) {}

  async notify<T extends MailTemplate>(params: NotifyParams<T>): Promise<void> {
    await this.prisma.notification.create({
      // tenantId explicit even though the tenant extension would overwrite
      // it regardless — see CurrentTenantService's doc comment.
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        type: params.type,
        payload: params.payload,
      },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: params.userId } });

    let deliveredViaTelegram = false;
    if (user.telegramChatId) {
      try {
        await this.telegramService.sendMessage(user.telegramChatId, params.telegramText);
        deliveredViaTelegram = true;
      } catch (error) {
        this.logger.warn(
          `Telegram-доставка не удалась для пользователя ${user.id}, переключаюсь на email: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (!deliveredViaTelegram) {
      await this.mailQueue.enqueue({
        tenantId: params.tenantId,
        userId: user.id,
        to: user.email,
        subject: params.email.subject,
        template: params.email.template,
        context: params.email.context,
      });
    }
  }

  async findAll(
    query: ListNotificationsQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<NotificationResponseDto[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId: currentUser.id, isRead: query.unreadOnly ? false : undefined },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return notifications.map(NotificationResponseDto.fromEntity);
  }

  async markRead(id: string, currentUser: AuthenticatedUser): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== currentUser.id) {
      throw new NotFoundException('Уведомление не найдено.');
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return NotificationResponseDto.fromEntity(updated);
  }

  async markAllRead(currentUser: AuthenticatedUser): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId: currentUser.id, isRead: false },
      data: { isRead: true },
    });
    return { updatedCount: result.count };
  }
}
