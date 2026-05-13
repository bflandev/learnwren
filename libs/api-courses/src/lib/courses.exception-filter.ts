import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { CoursesException } from './errors/courses.exception';

interface CoursesErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class CoursesExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoursesExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof CoursesException) {
      const body: CoursesErrorBody = {
        error: { code: exception.code, message: exception.message },
      };
      if (exception.details) {
        body.error.details = exception.details;
      }
      response.status(exception.status).json(body);
      return;
    }

    if (exception instanceof BadRequestException) {
      const payload = exception.getResponse() as { message?: string[] | string };
      const messages = Array.isArray(payload.message)
        ? payload.message
        : payload.message
          ? [payload.message]
          : [];
      const fieldErrors = parseFieldErrors(messages);
      response.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body failed validation.',
          details: { fieldErrors },
        },
      } satisfies CoursesErrorBody);
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies CoursesErrorBody);
  }
}

/**
 * class-validator emits messages like "title must be longer than or equal to 1 characters".
 * Extract the leading field name (the first word) as the key.
 */
function parseFieldErrors(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const msg of messages) {
    const field = msg.split(' ')[0];
    if (!out[field]) out[field] = [];
    out[field].push(msg);
  }
  return out;
}
