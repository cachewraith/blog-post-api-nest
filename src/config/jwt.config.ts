import { registerAs } from '@nestjs/config';

export interface JwtTokenConfig {
  secret: string;
  expiresIn: string;
}

export interface JwtConfig {
  access: JwtTokenConfig;
  refresh: JwtTokenConfig;
  reset: JwtTokenConfig;
  issuer: string;
  audience: string;
}

/**
 * Three separate secrets on purpose: a leaked reset secret must not be enough
 * to mint access tokens, and each token class verifies only against its own key
 * (OWASP A02/A07).
 */
export default registerAs('jwt', (): JwtConfig => ({
  access: {
    secret: process.env.JWT_ACCESS_SECRET!,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  },
  refresh: {
    secret: process.env.JWT_REFRESH_SECRET!,
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  reset: {
    secret: process.env.JWT_RESET_SECRET!,
    expiresIn: process.env.JWT_RESET_EXPIRES_IN ?? '10m',
  },
  issuer: 'blog-post-api',
  audience: 'blog-post-api-clients',
}));
