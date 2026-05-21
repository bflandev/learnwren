import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { VideoException } from './errors/video.exception';

interface VideoErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class VideoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('VideoExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof VideoException) {
      const body: VideoErrorBody = {
        error: { code: exception.code, message: exception.message },
      };
      if (exception.details) {
        body.error.details = exception.details;
      }
      response.status(exception.status).json(body);
      return;
    }

    // Auth exceptions share the same shape (code/status/message)
    if (
      exception instanceof Error &&
      (exception.name === 'AuthException' || exception.constructor.name === 'AuthException')
    ) {
      const err = exception as Error & {
        code: string;
        status: number;
        details?: Record<string, unknown>;
      };
      const body: VideoErrorBody = {
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
      const fieldErrors = parseFieldErrors(messages);
      response.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body failed validation.',
          details: { fieldErrors },
        },
      } satisfies VideoErrorBody);
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies VideoErrorBody);
  }
}

/**
 * class-validator emits messages like "sizeBytes must not be greater than 10000000000".
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
