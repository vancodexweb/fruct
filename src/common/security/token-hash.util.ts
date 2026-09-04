import { createHash, timingSafeEqual } from 'crypto';

/**
 * For high-entropy random tokens (refresh tokens, password-reset tokens) —
 * NOT for user passwords, which belong in password.util.ts (bcrypt).
 *
 * These tokens already carry 128+ bits of entropy, so bcrypt's slow,
 * salted hashing (designed to blunt brute-forcing of low-entropy secrets)
 * buys nothing here and only adds needless CPU cost. A deterministic
 * SHA-256 digest is the right tool: it lets a token be looked up directly
 * by its hash, which bcrypt's per-hash salt would make impossible.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function tokenHashMatches(rawToken: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashToken(rawToken), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (candidate.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(candidate, stored);
}
