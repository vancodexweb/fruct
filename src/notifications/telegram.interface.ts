/**
 * The one external channel besides email — kept behind an interface (same
 * reasoning as DeliveryEstimator/MailerService) so it can be mocked in
 * tests and swapped without touching NotificationsService.
 */
export interface TelegramService {
  sendMessage(chatId: string, text: string): Promise<void>;
}
