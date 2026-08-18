import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

// The TypeORM CLI runs outside Nest, so it loads its own env.
loadEnv({ path: process.env.ENV_FILE ?? '.env' });

/**
 * Used only by `npm run migration:*`. The running app builds its connection
 * from `DatabaseModule` instead.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [__dirname + '/../../**/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
});
