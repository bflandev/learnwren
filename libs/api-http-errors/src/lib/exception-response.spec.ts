import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  codeForStatus,
  formatLogLine,
  handleException,
  isDomainShaped,
} from './exception-response';

function buildHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function quietLogger(): Logger {
  const logger = new Logger('test');
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  return logger;
}

class FakeDomainException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

describe('codeForStatus', () => {
  it.each<[number, string]>([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [422, 'VALIDATION_ERROR'],
    [418, 'HTTP_ERROR'],
    [500, 'HTTP_ERROR'],
  ])('maps %i to %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });
});

describe('isDomainShaped', () => {
  it('is true for an Error with string code + number status', () => {
    expect(isDomainShaped(new FakeDomainException('X', 'm', 403))).toBe(true);
  });
  it('is false for a plain HttpException (no code property)', () => {
    expect(isDomainShaped(new HttpException('x', 403))).toBe(false);
  });
  it('is false for a BadRequestException', () => {
    expect(isDomainShaped(new BadRequestException('x'))).toBe(false);
  });
  it('is false for a plain object that happens to have code/status', () => {
    expect(isDomainShaped({ code: 'X', status: 400 })).toBe(false);
  });
});

describe('formatLogLine', () => {
  it('returns the stack for an Error', () => {
    const e = new Error('boom');
    expect(formatLogLine(e)).toBe(e.stack);
  });
  it('stringifies a non-Error', () => {
    expect(formatLogLine('weird')).toBe('weird');
  });
});

describe('handleException', () => {
  it('renders a domain-shaped exception with its status/code and details', () => {
    const { host, status, json } = buildHost();
    handleException(host, new FakeDomainException('NOT_OWNER', 'no', 403, { a: 1 }), quietLogger());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_OWNER', message: 'no', details: { a: 1 } },
    });
  });

  it('omits details when the domain exception has none', () => {
    const { host, json } = buildHost();
    handleException(host, new FakeDomainException('GONE', 'g', 404), quietLogger());
    expect(json).toHaveBeenCalledWith({ error: { code: 'GONE', message: 'g' } });
  });

  it('maps a BadRequestException to VALIDATION_FAILED + fieldErrors when validation is on', () => {
    const { host, status, json } = buildHost();
    const dtoErr = new BadRequestException({
      message: ['title must be longer', 'title must not be empty', 'price must be a number'],
      error: 'Bad Request',
      statusCode: 400,
    });
    handleException(host, dtoErr, quietLogger(), { validation: true });
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.fieldErrors.title).toHaveLength(2);
    expect(body.error.details.fieldErrors.price).toHaveLength(1);
  });

  it('treats a BadRequestException as a plain HttpException when validation is off', () => {
    const { host, status, json } = buildHost();
    handleException(host, new BadRequestException('x'), quietLogger());
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error.code).toBe('BAD_REQUEST');
  });

  it('maps a plain HttpException via codeForStatus', () => {
    const { host, status, json } = buildHost();
    handleException(host, new ForbiddenException('nope'), quietLogger());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'nope' } });
  });

  it('maps 413/415 HttpExceptions to their media codes', () => {
    const { host, json } = buildHost();
    handleException(host, new PayloadTooLargeException('big'), quietLogger());
    expect(json.mock.calls[0][0].error.code).toBe('PAYLOAD_TOO_LARGE');
    const second = buildHost();
    handleException(second.host, new UnsupportedMediaTypeException('type'), quietLogger());
    expect(second.json.mock.calls[0][0].error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('falls back to 500 INTERNAL for an unknown exception and logs it', () => {
    const { host, status, json } = buildHost();
    const logger = quietLogger();
    handleException(host, new Error('boom'), logger);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
