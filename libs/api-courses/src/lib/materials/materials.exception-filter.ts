import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthException } from '@learnwren/api-auth';

import { CoursesException } from '../errors/courses.exception';
import { MaterialException } from './errors/material.exception';

interface MaterialErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(MaterialException, CoursesException, AuthException, HttpException)
export class MaterialsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('MaterialsExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // MaterialException, CoursesException, and AuthException share the same
    // { code, status, message, details? } shape.
    if (
      exception instanceof MaterialException ||
      exception instanceof CoursesException ||
      exception instanceof AuthException
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

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
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

function codeForStatus(status: number): string {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION_ERROR';
  return 'HTTP_ERROR';
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
