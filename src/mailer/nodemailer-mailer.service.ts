import { Injectable, Logger } from '@nestjs/common';
import { Transporter } from 'nodemailer';
import { MailDeliveryException } from './mail-delivery.exception';
import { MailerService } from './mailer.service.interface';
import { RenderedMail } from './mailer.types';
import { createNodemailerTransport } from './nodemailer-transport.factory';
import { getSmtpConfigFromEnv } from './smtp-config';

/**
 * Real nodemailer-backed implementation of MailerService. Swap this for a
 * test double via the MAILER_SERVICE token in unit/e2e tests — nothing else
 * in the app should depend on nodemailer directly.
 */
@Injectable()
export class NodemailerMailerService implements MailerService {
  private readonly logger = new Logger(NodemailerMailerService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor() {
    const smtp = getSmtpConfigFromEnv();
    this.transporter = createNodemailerTransport(smtp);
    this.fromAddress = smtp.from;
  }

  async sendMail(mail: RenderedMail): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Не удалось отправить письмо на ${mail.to}: ${reason}`);
      throw new MailDeliveryException(
        `SMTP недоступен или отклонил письмо для получателя ${mail.to}: ${reason}`,
        error,
      );
    }
  }
}
