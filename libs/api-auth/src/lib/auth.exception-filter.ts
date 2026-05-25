import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthException } from './errors/auth.exception';

interface AuthErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Filter narrowed to AuthException + framework HttpException. The catch-all
 * fallback returns a generic 500 — we never serialize an unknown exception's
 * message, since that may leak Firestore/ORM internals.
 */
@Catch(AuthException, HttpException)
export class AuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('AuthExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AuthException) {
      const body: AuthErrorBody = {
        error: { code: exception.code, message: exception.message },
      };
      if (exception.details) {
        body.error.details = exception.details as Record<string, unknown>;
      }
      response.status(exception.status).json(body);
      return;
    }

    // Built-in NestJS HttpException (e.g. NotFoundException, BadRequestException)
    // — preserve the original status and a stable code; do not echo arbitrary
    // exception.message text since it may include framework details.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies AuthErrorBody);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack ?? exception.message : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies AuthErrorBody);
  }
}

function codeForStatus(status: number): string {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  return 'HTTP_ERROR';
}
