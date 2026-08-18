import { z } from 'zod';

/**
 * Shared password policy.
 *
 * The 72-character ceiling is not arbitrary: bcrypt silently truncates input
 * past 72 bytes, so accepting longer passwords would give users a false sense
 * of strength while ignoring the tail (OWASP A02).
 */
export const passwordSchema = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(72, 'password must be at most 72 characters')
  .regex(/[a-z]/, 'password must contain a lowercase letter')
  .regex(/[A-Z]/, 'password must contain an uppercase letter')
  .regex(/\d/, 'password must contain a digit');
