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
  PAYOUT_STATEMENT = 'payout-statement',
  PAYOUT_STATUS_CHANGED = 'payout-status-changed',
  SLA_BREACH = 'sla-breach',
  DAILY_DIGEST = 'daily-digest',
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

export interface PayoutStatementDealLine {
  date: string;
  totalAmount: string;
  commissionAmount: string;
}

export interface PayoutStatementContext {
  fullName: string;
  periodStart: string;
  periodEnd: string;
  baseSalary: string;
  totalCommission: string;
  totalPayout: string;
  deals: PayoutStatementDealLine[];
}

export interface PayoutStatusChangedContext {
  fullName: string;
  periodStart: string;
  periodEnd: string;
  totalPayout: string;
  statusLabel: string;
}

export interface SlaBreachContext {
  leadFullName: string;
  leadPhone: string;
  minutesOverdue: number;
}

export interface DailyDigestContext {
  tenantName: string;
  date: string;
  newLeadsCount: number;
  dealsClosedCount: number;
  revenueToday: string;
  slaBreachesCount: number;
}

export interface MailTemplateContextMap {
  [MailTemplate.CREDENTIALS_ISSUED]: CredentialsIssuedContext;
  [MailTemplate.PASSWORD_RESET]: PasswordResetContext;
  [MailTemplate.PAYOUT_STATEMENT]: PayoutStatementContext;
  [MailTemplate.PAYOUT_STATUS_CHANGED]: PayoutStatusChangedContext;
  [MailTemplate.SLA_BREACH]: SlaBreachContext;
  [MailTemplate.DAILY_DIGEST]: DailyDigestContext;
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
