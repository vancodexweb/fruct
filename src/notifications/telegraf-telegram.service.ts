import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegram } from 'telegraf';
import { TelegramService } from './telegram.interface';

/**
 * TODO(prod): set TELEGRAM_BOT_TOKEN in the environment to enable Telegram
 * delivery. Without it, sendMessage() throws rather than silently doing
 * nothing — NotificationsService catches that (same as any other Telegram
 * failure: invalid chat id, user blocked the bot, network error) and falls
 * back to email, per spec.
 *
 * Uses telegraf's plain `Telegram` API client, not the full `Telegraf` bot —
 * this app only ever sends messages, it never needs to receive updates.
 */
@Injectable()
export class TelegrafTelegramService implements TelegramService {
  private readonly logger = new Logger(TelegrafTelegramService.name);
  private readonly telegram: Telegram | null;

  constructor(config: ConfigService) {
    const token = config.get<string>('TELEGRAM_BOT_TOKEN');
    this.telegram = token ? new Telegram(token) : null;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.telegram) {
      throw new ServiceUnavailableException(
        'Telegram не сконфигурирован (переменная окружения TELEGRAM_BOT_TOKEN не задана).',
      );
    }
    try {
      await this.telegram.sendMessage(chatId, text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Не удалось отправить сообщение в Telegram (chatId=${chatId}): ${reason}`);
      throw new ServiceUnavailableException(`Не удалось отправить сообщение в Telegram: ${reason}`);
    }
  }
}
