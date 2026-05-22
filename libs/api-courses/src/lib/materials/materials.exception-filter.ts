import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { CoursesException } from '../errors/courses.exception';
import { MaterialException } from './errors/material.exception';

interface MaterialErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class MaterialsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('MaterialsExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // MaterialException, CoursesException, and AuthException share the same
    // { code, status, message, details? } shape.
    if (
      exception instanceof MaterialException ||
      exception instanceof CoursesException ||
      (exception instanceof Error &&
        (exception.name === 'AuthException' ||
          exception.constructor.name === 'AuthException'))
    ) {
      const err = exception as Error & {
        code: string;
        status: number;
        details?: Record<string, unknown>;
      };
      const body: MaterialErrorBody = {
        error: { code: err.code, message: err.message },
      };
      if (err.details) body.error.details = err.details;
      response.status(err.status).json(body);
      return;
    }

    if (exception instanceof BadRequestException) {
      const payload = exception.getResponse() as { message?: string[] | string };
      const messages = Array.isArray(payload.message)
        ? payload.message
        : payload.message
          ? [payload.message]
          : [];
      response.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body failed validation.',
          details: { fieldErrors: parseFieldErrors(messages) },
        },
      } satisfies MaterialErrorBody);
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies MaterialErrorBody);
  }
}

/** class-validator emits "filename should not be empty" — key on the first word. */
function parseFieldErrors(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const msg of messages) {
    const field = msg.split(' ')[0];
    if (!field) continue;
    (out[field] ??= []).push(msg);
  }
  return out;
}
