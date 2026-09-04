import nodemailer, { Transporter } from 'nodemailer';
import { SmtpConfig } from './smtp-config';

export function createNodemailerTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });
}
