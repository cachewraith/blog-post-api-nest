import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import {
  Observable,
  TimeoutError,
  catchError,
  throwError,
  timeout,
} from 'rxjs';

/**
 * Deliberately a constant rather than a constructor argument — Nest resolves
 * APP_INTERCEPTOR providers through DI, and a `number` parameter has no
 * injectable token.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** Caps request duration so a stalled dependency cannot pin a worker open. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError ? new RequestTimeoutException() : error,
        ),
      ),
    );
  }
}
