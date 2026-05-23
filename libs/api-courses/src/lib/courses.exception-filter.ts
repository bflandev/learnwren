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

type CoursesShapedException = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

@Catch()
export class CoursesExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoursesExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (isCoursesShaped(exception)) {
      respondShaped(response, exception);
      return;
    }
    if (exception instanceof BadRequestException) {
      respondValidation(response, exception);
      return;
    }
    this.logger.error(formatLogLine(exception));
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies CoursesErrorBody);
  }
}

function isCoursesShaped(exception: unknown): exception is CoursesShapedException {
  if (exception instanceof CoursesException) return true;
  if (!(exception instanceof Error)) return false;
  return exception.name === 'AuthException' || exception.constructor.name === 'AuthException';
}

function respondShaped(response: Response, err: CoursesShapedException): void {
  const body: CoursesErrorBody = { error: { code: err.code, message: err.message } };
  if (err.details) body.error.details = err.details;
  response.status(err.status).json(body);
}

function respondValidation(response: Response, exception: BadRequestException): void {
  const payload = exception.getResponse() as { message?: string[] | string };
  const messages = normalizeMessages(payload.message);
  response.status(400).json({
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Request body failed validation.',
      details: { fieldErrors: parseFieldErrors(messages) },
    },
  } satisfies CoursesErrorBody);
}

function normalizeMessages(message: string[] | string | undefined): string[] {
  if (Array.isArray(message)) return message;
  return message ? [message] : [];
}

function formatLogLine(exception: unknown): string {
  if (exception instanceof Error) return exception.stack ?? exception.message;
  return String(exception);
}

/**
 * class-validator emits messages like "title must be longer than or equal to 1 characters".
 * Extract the leading field name (the first word) as the key.
 */
function parseFieldErrors(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const msg of messages) {
    const parts = msg.split(' ');
    const field = parts[0];
    if (!field) continue;
    if (!out[field]) out[field] = [];
    out[field].push(msg);
  }
  return out;
}
