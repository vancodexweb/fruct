import { randomBytes } from 'crypto';

/**
 * Cryptographically random, URL-safe token. Used for auto-generated
 * temporary passwords, password-reset links, and anywhere else we need an
 * unguessable secret — never Math.random().
 */
export function generateSecureToken(byteLength = 24): string {
  return randomBytes(byteLength).toString('base64url');
}
