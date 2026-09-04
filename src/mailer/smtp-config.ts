export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Reads SMTP settings straight from process.env rather than through
 * ConfigService, so this exact logic can be shared by both the Nest-wired
 * NodemailerMailerService and the standalone prisma/seed.ts script (which
 * has no Nest DI container to pull a ConfigService from).
 */
export function getSmtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM } = env;

  if (!SMTP_HOST || !SMTP_PORT || !MAIL_FROM) {
    throw new Error(
      'SMTP не сконфигурирован: необходимо задать SMTP_HOST, SMTP_PORT и MAIL_FROM в переменных окружения.',
    );
  }

  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: MAIL_FROM,
  };
}
