import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { AuthException } from './errors/auth.exception';

interface AuthErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
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

    this.logger.error(
      exception instanceof Error ? exception.stack ?? exception.message : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies AuthErrorBody);
  }
}
