import { registerAs } from '@nestjs/config';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export interface SecurityConfig {
  cors: CorsOptions;
  /** Proxy hops to trust when deriving the client IP. */
  trustProxyHops: number;
  /** Ceiling on request body size; auth payloads are tiny. */
  bodyLimit: string;
}

/**
 * Transport- and header-level security settings, grouped so they can be
 * audited in one place.
 *
 * The CORS allowlist is built from CORS_ORIGINS (comma-separated). An empty
 * list means same-origin only — we never fall back to `*`, which would pair
 * with credentials to expose authenticated endpoints to any site (OWASP A05).
 */
export default registerAs('security', (): SecurityConfig => {
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    cors: {
      origin: origins.length > 0 ? origins : false,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 86400,
    },
    // Exactly one hop. Without a bound, a client could forge X-Forwarded-For
    // and slip the IP-keyed rate limiter (OWASP A04).
    trustProxyHops: 1,
    bodyLimit: '100kb',
  };
});
