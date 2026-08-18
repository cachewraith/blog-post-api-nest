import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, map } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { Reflector } from '@nestjs/core';

export interface ApiEnvelope<T> {
  data: T;
  message: string;
  status: number;
}

/** Wraps every successful response as `{ data, message, status }`. */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiEnvelope<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiEnvelope<T>> {
    const response = context.switchToHttp().getResponse<Response>();
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'Success';

    return next.handle().pipe(
      map((data) => ({
        data: data ?? null,
        message,
        status: response.statusCode,
      })),
    ) as Observable<ApiEnvelope<T>>;
  }
}
