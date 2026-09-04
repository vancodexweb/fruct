export const TELEGRAM_SERVICE = Symbol('TELEGRAM_SERVICE');

export const NOTIFICATIONS_QUEUE_NAME = 'notifications-cron';

export const SLA_CHECK_JOB_NAME = 'sla-check';
export const DAILY_DIGEST_JOB_NAME = 'daily-digest';

/** BullMQ upsertJobScheduler ids — stable so re-deploys don't register duplicate schedulers. */
export const SLA_CHECK_SCHEDULER_ID = 'sla-check-scheduler';
export const DAILY_DIGEST_SCHEDULER_ID = 'daily-digest-scheduler';

export const SLA_CHECK_INTERVAL_MS = 60_000;
/** 08:00 UTC daily — see NotificationsProcessor's doc comment on the per-tenant-timezone simplification. */
export const DAILY_DIGEST_CRON_PATTERN = '0 8 * * *';
