import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigType } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import throttleConfig from '../config/throttle.config';
import { AllExceptionsFilter } from './exceptions/http-exception.filter';
import { JwtAuthGuard } from './guards/jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { ThrottleGuard } from './guards/throttle.guard';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';
import { ResponseInterceptor } from './interceptors/response.interceptor';

/**
 * Wires the cross-cutting behaviour once, app-wide.
 *
 * Guard order matters and follows registration order: throttle first (cheapest,
 * and it must fire before auth so credential stuffing is capped), then
 * authentication, then role authorization.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [throttleConfig.KEY],
      useFactory: (config: ConfigType<typeof throttleConfig>) => ({
        throttlers: [{ ttl: config.ttl * 1000, limit: config.limit }],
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottleGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class CommonModule {}
