import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
}

export default registerAs('database', (): DatabaseConfig => ({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  // Never on in production — migrations own the schema there.
  synchronize:
    process.env.DB_SYNCHRONIZE === 'true' &&
    process.env.NODE_ENV !== 'production',
  logging: process.env.DB_LOGGING === 'true',
}));
