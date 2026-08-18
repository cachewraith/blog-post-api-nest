/** Cost factor for password hashing. 12 keeps bcrypt slow enough to matter. */
export const BCRYPT_ROUNDS = 12;

/** Number of decimal digits in a one-time password. */
export const OTP_LENGTH = 6;

/** How long an issued OTP stays usable. */
export const OTP_TTL_MINUTES = 10;

/** Wrong-code submissions allowed before the OTP burns itself. */
export const OTP_MAX_ATTEMPTS = 5;

/**
 * Constant returned by every OTP-issuing endpoint. Identical whether or not the
 * address belongs to an account, so the response cannot be used to enumerate
 * users (OWASP A07).
 */
export const OTP_DISPATCH_MESSAGE =
  'If an account matches that email, a verification code has been sent to it.';
