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

import { VideoException } from './errors/video.exception';

interface VideoErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

type VideoShapedException = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

@Catch(VideoException, AuthException, HttpException)
export class VideoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('VideoExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (isVideoShaped(exception)) {
      respondShaped(response, exception);
      return;
    }
    if (exception instanceof BadRequestException) {
      respondValidation(response, exception);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies VideoErrorBody);
      return;
    }
    this.logger.error(formatLogLine(exception));
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies VideoErrorBody);
  }
}

function isVideoShaped(exception: unknown): exception is VideoShapedException {
  return exception instanceof VideoException || exception instanceof AuthException;
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

function respondShaped(response: Response, err: VideoShapedException): void {
  const body: VideoErrorBody = { error: { code: err.code, message: err.message } };
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
  } satisfies VideoErrorBody);
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
