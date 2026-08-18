import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import corsConfig from './config/cors.config';
import databaseConfig from './config/database.config';
import { validateEnv } from './config/env.validation';
import jwtConfig from './config/jwt.config';
import throttleConfig from './config/throttle.config';
import { CoreModule } from './core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DatabaseModule } from './shared/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [appConfig, databaseConfig, jwtConfig, throttleConfig, corsConfig],
      // Boot fails loudly on a missing or weak secret rather than starting
      // with a default (OWASP A05).
      validate: validateEnv,
    }),
    CoreModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
