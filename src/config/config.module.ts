import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import appConfig from './app.config';
import databaseConfig from './database.config';
import { validateEnv } from './env.validation';
import jwtConfig from './jwt.config';
import mailConfig from './mail.config';
import securityConfig from './security.config';
import throttleConfig from './throttle.config';

/**
 * Loads and validates every config factory in one place, so `AppModule` wires
 * modules rather than environment plumbing. Adding a concern means adding a
 * factory to `load` here and its contract to `env.validation.ts` — nowhere
 * else.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        throttleConfig,
        securityConfig,
        mailConfig,
      ],
      // Boot fails loudly on a missing or weak secret rather than starting
      // with a default (OWASP A05).
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
