import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { PictureException } from './errors/picture.exception';

interface PictureErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(PictureException, HttpException)
export class PictureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('PictureExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof PictureException) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      } satisfies PictureErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies PictureErrorBody);
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies PictureErrorBody);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_MEDIA_TYPE';
    default: return 'ERROR';
  }
}
