/**
 * One entry per .hbs file in src/mailer/templates/. Extend this (and add the
 * matching template + context type) as later modules need new emails —
 * payout statements, SLA breach alerts, the daily digest, etc.
 */
export enum MailTemplate {
  // Used both when OWNER creates a manager and by the bootstrap seed script
  // that creates the first OWNER — same shape (email + temp password),
  // `roleLabel` carries the human-readable role for the email copy.
  CREDENTIALS_ISSUED = 'credentials-issued',
  PASSWORD_RESET = 'password-reset',
}

export interface CredentialsIssuedContext {
  fullName: string;
  email: string;
  temporaryPassword: string;
  roleLabel: string;
}

export interface PasswordResetContext {
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface MailTemplateContextMap {
  [MailTemplate.CREDENTIALS_ISSUED]: CredentialsIssuedContext;
  [MailTemplate.PASSWORD_RESET]: PasswordResetContext;
}

/** Already-rendered email, ready to hand to a transport. */
export interface RenderedMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * BullMQ job payload. Must stay JSON-serializable — no Decimal/Date
 * instances, callers format those to strings before enqueueing.
 *
 * `tenantId` (and optionally `userId`) let the mail processor re-establish
 * the CLS tenant context (see TenantContextService) so it can write an
 * ActivityLog entry on failure through the same tenant-scoped Prisma client
 * every HTTP request uses — the processor runs outside any HTTP request, so
 * there is no ambient context to inherit it from.
 */
export interface MailJobPayload<T extends MailTemplate = MailTemplate> {
  tenantId: string;
  userId?: string;
  to: string;
  subject: string;
  template: T;
  context: MailTemplateContextMap[T];
}
