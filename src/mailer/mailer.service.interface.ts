import { RenderedMail } from './mailer.types';

/**
 * Low-level "just send this rendered email" contract. Kept separate from
 * templating/queueing so it can be mocked in tests without touching Redis
 * or Handlebars. Injected via the MAILER_SERVICE token (see mailer.constants.ts).
 */
export interface MailerService {
  sendMail(mail: RenderedMail): Promise<void>;
}
