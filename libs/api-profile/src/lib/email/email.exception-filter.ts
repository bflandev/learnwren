import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthException } from '@learnwren/api-auth';
import { EmailChangeException } from './errors/email-change.exception';

interface EmailChangeErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(EmailChangeException, AuthException, HttpException)
export class EmailChangeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('EmailChangeExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof EmailChangeException) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      } satisfies EmailChangeErrorBody);
      return;
    }
    if (exception instanceof AuthException) {
      response.status(exception.status).json({
        error: { code: exception.code, message: exception.message },
      } satisfies EmailChangeErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies EmailChangeErrorBody);
      return;
    }
    this.logger.error(
      exception instanceof Error ? exception.stack ?? exception.message : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies EmailChangeErrorBody);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    default: return 'ERROR';
  }
}
