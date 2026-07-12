import { ArgumentsHost, BadRequestException, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/** The canonical error envelope every API exception filter emits. */
export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * Structural shape shared by every domain exception (AuthException,
 * CoursesException, VideoException, ProfileException, …). The helper is
 * domain-agnostic — it never imports a specific exception class. Each filter's
 * `@Catch(...)` list remains the explicit allowlist; this only routes what
 * `@Catch` already admitted.
 */
export type DomainShapedException = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

export interface HandleExceptionOptions {
  /** Map a NestJS BadRequestException to VALIDATION_FAILED + fieldErrors. */
  validation?: boolean;
}

const INTERNAL_ERROR_BODY: ErrorBody = {
  error: { code: 'INTERNAL', message: 'An internal error occurred.' },
};

export function isDomainShaped(exception: unknown): exception is DomainShapedException {
  return (
    exception instanceof Error &&
    typeof (exception as { code?: unknown }).code === 'string' &&
    typeof (exception as { status?: unknown }).status === 'number'
  );
}

export function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      // The global ThrottlerException lands here — clients must be able to
      // distinguish "slow down" from a generic HTTP failure.
      return 'TOO_MANY_REQUESTS';
    default:
      return 'HTTP_ERROR';
  }
}

export function formatLogLine(exception: unknown): string {
  if (exception instanceof Error) return exception.stack ?? exception.message;
  return String(exception);
}

/** class-validator emits "field must be …"; key field errors by the leading word. */
function parseFieldErrors(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const msg of messages) {
    const field = msg.split(' ')[0];
    if (!field) continue;
    if (!out[field]) out[field] = [];
    out[field].push(msg);
  }
  return out;
}

function normalizeMessages(message: string[] | string | undefined): string[] {
  if (Array.isArray(message)) return message;
  return message ? [message] : [];
}

export function respondValidation(res: Response, exception: BadRequestException): void {
  const payload = exception.getResponse() as { message?: string[] | string };
  const messages = normalizeMessages(payload.message);
  res.status(400).json({
    error: {
      code: 'VALIDATION_FAILED',
      message: 'Request body failed validation.',
      details: { fieldErrors: parseFieldErrors(messages) },
    },
  } satisfies ErrorBody);
}

/**
 * Render `exception` to the HTTP response. Order: domain-shaped → (optional)
 * validation → plain HttpException → 500 INTERNAL. A BadRequestException is an
 * HttpException and is NOT domain-shaped (no own `code`), so the validation
 * branch is only reached when `opts.validation` is set.
 */
export function handleException(
  host: ArgumentsHost,
  exception: unknown,
  logger: Logger,
  opts: HandleExceptionOptions = {},
): void {
  const res = host.switchToHttp().getResponse<Response>();

  if (isDomainShaped(exception)) {
    const body: ErrorBody = { error: { code: exception.code, message: exception.message } };
    if (exception.details) body.error.details = exception.details;
    res.status(exception.status).json(body);
    return;
  }
  if (opts.validation && exception instanceof BadRequestException) {
    respondValidation(res, exception);
    return;
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    res.status(status).json({
      error: { code: codeForStatus(status), message: exception.message },
    } satisfies ErrorBody);
    return;
  }
  logger.error(formatLogLine(exception));
  res.status(500).json(INTERNAL_ERROR_BODY);
}
