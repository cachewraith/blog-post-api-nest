import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

/**
 * Request/response audit line. Logs method, path, status, duration and the
 * acting user id — never headers or bodies, which carry passwords and bearer
 * tokens (OWASP A09).
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const actor = request.user?.id ?? 'anonymous';
          this.logger.log(
            `${request.method} ${request.url} ${response.statusCode} ${Date.now() - startedAt}ms user=${actor}`,
          );
        },
      }),
    );
  }
}
