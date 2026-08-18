import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Plain number, not the enum: `status` is a widened number by this point. */
const SERVER_ERROR_THRESHOLD = 500;

interface ErrorBody {
  message: string;
  errors?: unknown;
}

/**
 * Terminal error handler. Stack traces and driver messages are logged
 * server-side but never serialised to the client; unexpected failures collapse
 * to a flat 500 (OWASP A05 verbose errors, A09 logging).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.normalise(exception);

    if (status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}`);
    }

    response.status(status).json({
      data: null,
      message: body.message,
      status,
      ...(body.errors ? { errors: body.errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private normalise(exception: unknown): {
    status: number;
    body: ErrorBody;
  } {
    // Checked before the HttpException branch: Nest re-wraps these, and the
    // wrapped message is the raw parser text (offsets, expected tokens).
    const bodyParserStatus = this.bodyParserStatus(exception);
    if (bodyParserStatus) return bodyParserStatus;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, body: { message: payload } };
      }

      const record = payload as Record<string, unknown>;

      return {
        status,
        body: {
          message: this.toMessage(record.message) ?? exception.message,
          errors: record.errors,
        },
      };
    }

    // Driver errors can echo SQL and column names — swallow the detail.
    if (exception instanceof QueryFailedError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: { message: 'A database error occurred' },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { message: 'Internal server error' },
    };
  }

  /**
   * Reduce an exception payload's `message` to a single string. Anything that
   * is not a string or an array of strings is discarded rather than coerced —
   * stringifying an arbitrary object risks spilling internals into the
   * response (OWASP A05).
   */
  private toMessage(raw: unknown): string | null {
    if (typeof raw === 'string') return raw;

    if (Array.isArray(raw)) {
      const parts = raw.filter(
        (item): item is string => typeof item === 'string',
      );
      return parts.length > 0 ? parts.join(', ') : null;
    }

    return null;
  }

  /**
   * body-parser rejects before Nest sees the request, and its errors carry a
   * `type` tag instead of being HttpExceptions — an oversized body would
   * otherwise be reported as a 500. The message we return is ours, so the
   * configured limit is not disclosed (OWASP A05).
   *
   * Malformed JSON is not handled here: Nest already converts that SyntaxError
   * into a 400 BadRequestException (losing the `type` tag), and its message
   * describes the client's own payload rather than anything server-side.
   */
  private bodyParserStatus(
    exception: unknown,
  ): { status: number; body: ErrorBody } | null {
    const type = (exception as { type?: string } | undefined)?.type;

    if (type === 'entity.too.large') {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        body: { message: 'Request body too large' },
      };
    }

    return null;
  }
}
