import { compare, hash } from 'bcrypt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { BCRYPT_ROUNDS, OTP_LENGTH } from '../constants/auth.constants';

/** Hash a user-chosen secret (password). Deliberately slow. */
export function hashSecret(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS);
}

/** Verify a user-chosen secret against its bcrypt hash. */
export function verifySecret(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}

/**
 * Hash a high-entropy machine-generated secret (refresh token, OTP digits).
 * SHA-256 is right here: these values are random and short-lived, so there is
 * nothing to brute-force offline, and lookups stay cheap.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compare two hex digests without leaking their difference through timing. */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Generate a zero-padded numeric OTP using a CSPRNG. */
export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  return randomInt(0, max).toString().padStart(OTP_LENGTH, '0');
}
