import { registerAs } from '@nestjs/config';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  /** Path segment before the version, e.g. `api` in `/api/v1/auth/login`. */
  apiPrefix: string;
  /** Version applied to controllers that do not declare one themselves. */
  defaultApiVersion: string;
  isProduction: boolean;
}

export default registerAs('app', (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  defaultApiVersion: process.env.API_DEFAULT_VERSION ?? '1',
  isProduction: process.env.NODE_ENV === 'production',
}));
