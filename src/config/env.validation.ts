import { z } from 'zod';

/**
 * Fail-fast environment contract. Anything security-relevant is required with
 * no default, so a missing secret stops boot instead of silently falling back
 * to a well-known value (OWASP A05).
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    // Prefix and version are separate: Nest builds `/{prefix}/v{version}/...`,
    // so a v2 controller can ship beside v1 without touching either value.
    API_PREFIX: z.string().default('api'),
    API_DEFAULT_VERSION: z.string().regex(/^\d+$/).default('1'),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(5432),
    DB_USERNAME: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    DB_SYNCHRONIZE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    DB_LOGGING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    JWT_RESET_SECRET: z.string().min(32),
    JWT_RESET_EXPIRES_IN: z.string().default('10m'),

    THROTTLE_TTL: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

    CORS_ORIGINS: z.string().default(''),

    // `log` (the default) prints mail to the console instead of sending it, so
    // a fresh checkout boots without SMTP credentials. `smtp` requires them —
    // enforced by the refinement below, not by a fallback.
    MAIL_MAILER: z.enum(['smtp', 'log']).default('log'),
    MAIL_HOST: z.string().default(''),
    MAIL_PORT: z.coerce.number().int().positive().default(587),
    MAIL_USERNAME: z.string().default(''),
    MAIL_PASSWORD: z.string().default(''),
    MAIL_ENCRYPTION: z.enum(['tls', 'ssl', 'null', '']).default('tls'),
    MAIL_FROM_ADDRESS: z.string().email().or(z.literal('')).default(''),
    MAIL_FROM_NAME: z.string().default('No Reply'),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_MAILER !== 'smtp') return;

    // Half-configured SMTP fails at the first OTP send — hours after boot, and
    // only for the user who triggered it. Fail at startup instead.
    for (const key of [
      'MAIL_HOST',
      'MAIL_USERNAME',
      'MAIL_PASSWORD',
      'MAIL_FROM_ADDRESS',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when MAIL_MAILER=smtp`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return parsed.data;
}
