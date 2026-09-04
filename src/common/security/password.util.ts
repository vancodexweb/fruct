import * as bcrypt from 'bcrypt';

// 12 rounds is the OWASP-recommended floor for bcrypt as of 2024+; bump this
// (not the per-call value) if server hardware makes it cheap to raise.
const BCRYPT_SALT_ROUNDS = 12;

export function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, BCRYPT_SALT_ROUNDS);
}

export function verifyPassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
