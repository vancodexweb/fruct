import type { SignOptions } from 'jsonwebtoken';

/**
 * JWT_*_EXPIRES_IN env vars are free-form duration strings (e.g. "15m",
 * "30d"), validated only as non-empty strings at boot (see env.validation.ts).
 * jsonwebtoken's own types accept only a template-literal-typed subset it
 * can't express for an arbitrary runtime string, so this casts once, in one
 * place, instead of scattering `as` through auth code. A malformed value
 * still fails loudly at runtime — jsonwebtoken throws when signing if it
 * can't parse the duration.
 */
export function asJwtExpiry(value: string): NonNullable<SignOptions['expiresIn']> {
  return value as NonNullable<SignOptions['expiresIn']>;
}
