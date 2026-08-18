import { registerAs } from '@nestjs/config';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Strict allowlist built from CORS_ORIGINS (comma-separated). An empty list
 * means same-origin only — we never fall back to `*`, which would pair with
 * credentials to expose authenticated endpoints to any site (OWASP A05).
 */
export default registerAs('cors', (): CorsOptions => {
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: origins.length > 0 ? origins : false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  };
});
