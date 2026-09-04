import { ConfigService } from '@nestjs/config';

/**
 * This project is backend-only — there is no frontend in this repo, so we
 * don't actually know where the password-reset page lives. Rather than
 * silently pointing the emailed link at the API itself (which would be
 * wrong), this builds the link from an explicit, OPTIONAL
 * PASSWORD_RESET_URL_BASE env var (not in the original .env.example list —
 * added deliberately, flagged here rather than hidden).
 *
 * TODO(frontend): once a frontend exists, point PASSWORD_RESET_URL_BASE at
 * its "/reset-password" route in production. Until then this falls back to
 * DOMAIN (the API's own public host) so the link is at least well-formed,
 * and finally to localhost for local dev.
 */
export function buildPasswordResetUrl(config: ConfigService, rawToken: string): string {
  const explicitBase = config.get<string>('PASSWORD_RESET_URL_BASE');
  const domain = config.get<string>('DOMAIN');
  const port = config.get<number>('PORT', 3001);

  const base = explicitBase || (domain ? `https://${domain}` : `http://localhost:${port}`);
  return `${base.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
}
