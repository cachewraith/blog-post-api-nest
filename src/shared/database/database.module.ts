import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../../config/database.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres' as const,
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        database: config.database,
        // Entities are registered per feature module via forFeature.
        autoLoadEntities: true,
        synchronize: config.synchronize,
        logging: config.logging,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsTableName: 'migrations',
      }),
    }),
  ],
})
export class DatabaseModule {}
