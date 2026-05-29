import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthException } from '@learnwren/api-auth';

import { ModuleNotFoundException } from '../errors/courses.exception';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import { InvalidMaterialStateException, MaterialNotFoundException } from './errors/material.exception';

function hostCapturing(): { host: ArgumentsHost; status: () => number; body: () => unknown } {
  let statusCode = 0;
  let payload: unknown;
  const res = {
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    json: (b: unknown) => {
      payload = b;
      return res;
    },
  };
  return {
    host: { switchToHttp: () => ({ getResponse: () => res }) } as ArgumentsHost,
    status: () => statusCode,
    body: () => payload,
  };
}

describe('MaterialsExceptionFilter', () => {
  it('maps a MaterialException to its code + status', () => {
    const cap = hostCapturing();
    new MaterialsExceptionFilter().catch(new MaterialNotFoundException(), cap.host);
    expect(cap.status()).toBe(404);
    expect(cap.body()).toEqual({
      error: { code: 'MATERIAL_NOT_FOUND', message: 'Material not found.' },
    });
  });

  it('maps a CoursesException thrown from the controller', () => {
    const cap = hostCapturing();
    new MaterialsExceptionFilter().catch(new ModuleNotFoundException(), cap.host);
    expect(cap.status()).toBe(404);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('MODULE_NOT_FOUND');
  });

  it('maps a BadRequestException to 400 VALIDATION_FAILED with fieldErrors (array message)', () => {
    const cap = hostCapturing();
    const bad = new BadRequestException({ message: ['filename should not be empty'] });
    new MaterialsExceptionFilter().catch(bad, cap.host);
    expect(cap.status()).toBe(400);
    const body = cap.body() as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual({
      fieldErrors: { filename: ['filename should not be empty'] },
    });
  });

  it('maps a BadRequestException to 400 VALIDATION_FAILED with a scalar message string', () => {
    // Covers the `payload.message ? [payload.message] : []` branch (NoCoverage on array wrapping).
    const cap = hostCapturing();
    const bad = new BadRequestException({ message: 'sizeBytes must be a positive number' });
    new MaterialsExceptionFilter().catch(bad, cap.host);
    expect(cap.status()).toBe(400);
    const body = cap.body() as { error: { code: string; details?: { fieldErrors: Record<string, string[]> } } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details?.fieldErrors?.['sizeBytes']).toContain('sizeBytes must be a positive number');
  });

  it('maps a BadRequestException with no message to 400 VALIDATION_FAILED with empty fieldErrors', () => {
    // Covers the `[] ` branch when payload.message is undefined.
    const cap = hostCapturing();
    const bad = new BadRequestException({});
    new MaterialsExceptionFilter().catch(bad, cap.host);
    expect(cap.status()).toBe(400);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('maps an AuthException via instanceof (no string-name matching)', () => {
    const cap = hostCapturing();
    const authErr = new AuthException('NOT_AUTHENTICATED', 'No session.', 401);
    new MaterialsExceptionFilter().catch(authErr, cap.host);
    expect(cap.status()).toBe(401);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('NOT_AUTHENTICATED');
  });

  it('includes details in the error body when the MaterialException carries them', () => {
    // Pins the `if (err.details) body.error.details = err.details` branch.
    // InvalidMaterialStateException carries `{ currentState }` in details.
    const cap = hostCapturing();
    new MaterialsExceptionFilter().catch(new InvalidMaterialStateException('TRANSCODING'), cap.host);
    expect(cap.status()).toBe(409);
    const body = cap.body() as { error: { code: string; details?: Record<string, unknown> } };
    expect(body.error.details).toEqual({ currentState: 'TRANSCODING' });
  });

  it('omits details from the error body when the exception has no details', () => {
    // Pins the false branch of `if (err.details)`.
    const cap = hostCapturing();
    new MaterialsExceptionFilter().catch(new MaterialNotFoundException(), cap.host);
    const body = cap.body() as { error: { details?: unknown } };
    expect(body.error.details).toBeUndefined();
  });

  it('maps an unknown error to 500 INTERNAL with the correct message', () => {
    // Pins both `error.code` and `error.message` in the 500 response body.
    const cap = hostCapturing();
    const filter = new MaterialsExceptionFilter();
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    filter.catch(new Error('boom'), cap.host);
    expect(cap.status()).toBe(500);
    const body = cap.body() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).toBe('An internal error occurred.');
  });

  it('logs exception.stack when it is present (pins the ?? over &&)', () => {
    // Pins `exception.stack ?? exception.message`: with `??`, a stack always wins over message.
    // With `&&`, an empty/falsy stack would fall through to message.
    // This test checks the logger receives the stack text when the error has one.
    const cap = hostCapturing();
    const filter = new MaterialsExceptionFilter();
    const loggedMessages: unknown[] = [];
    vi.spyOn(filter['logger'], 'error').mockImplementation((msg: unknown) => {
      loggedMessages.push(msg);
    });
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at test:1:1';
    filter.catch(err, cap.host);
    expect(loggedMessages[0]).toContain('at test:1:1');
  });

  it('logs exception.message when stack is absent', () => {
    // Covers the fallback branch of `exception.stack ?? exception.message`.
    const cap = hostCapturing();
    const filter = new MaterialsExceptionFilter();
    const loggedMessages: unknown[] = [];
    vi.spyOn(filter['logger'], 'error').mockImplementation((msg: unknown) => {
      loggedMessages.push(msg);
    });
    const err = new Error('no stack here');
    delete err.stack;
    filter.catch(err, cap.host);
    expect(loggedMessages[0]).toBe('no stack here');
  });

  it('maps a BadRequestException to 400 with the validation-failed message text', () => {
    // Pins the `message` field in the VALIDATION_FAILED response body.
    const cap = hostCapturing();
    const bad = new BadRequestException({ message: ['email must be an email'] });
    new MaterialsExceptionFilter().catch(bad, cap.host);
    const body = cap.body() as { error: { code: string; message: string } };
    expect(body.error.message).toBe('Request body failed validation.');
  });

  it('skips messages with no leading field name in parseFieldErrors (pins the !field guard)', () => {
    // A message that starts with a space has an empty first word — `if (!field) continue` skips it.
    // Without the guard (mutation: false), the empty string would become a key in fieldErrors.
    const cap = hostCapturing();
    const bad = new BadRequestException({ message: [' should not be empty', 'email must be valid'] });
    new MaterialsExceptionFilter().catch(bad, cap.host);
    const body = cap.body() as { error: { details?: { fieldErrors: Record<string, string[]> } } };
    const keys = Object.keys(body.error.details?.fieldErrors ?? {});
    expect(keys).not.toContain('');
    expect(keys).toContain('email');
  });
});

describe('MaterialsExceptionFilter — HttpException status → code mapping', () => {
  // Pins every branch of the shared codeForStatus() helper (api-http-errors),
  // exercised through the filter. BadRequestException
  // is intercepted upstream into VALIDATION_FAILED, so the 400 branch here is
  // reached only by a plain HttpException base instance. 418 pins the default.
  it.each<[number, string]>([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [422, 'VALIDATION_ERROR'],
    [418, 'HTTP_ERROR'],
  ])('maps a plain HttpException(%i) to %s', (statusCode, code) => {
    const cap = hostCapturing();
    new MaterialsExceptionFilter().catch(new HttpException('http err', statusCode), cap.host);
    expect(cap.status()).toBe(statusCode);
    const body = cap.body() as { error: { code: string; message: string } };
    expect(body.error.code).toBe(code);
    expect(body.error.message).toBe('http err');
  });
});
