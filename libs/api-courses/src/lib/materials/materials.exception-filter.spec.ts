import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ModuleNotFoundException } from '../errors/courses.exception';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import { MaterialNotFoundException } from './errors/material.exception';

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

  it('maps a BadRequestException to 400 VALIDATION_FAILED with fieldErrors', () => {
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

  it('maps an AuthException by name', () => {
    const cap = hostCapturing();
    const authErr = Object.assign(new Error('No session.'), {
      name: 'AuthException',
      code: 'NOT_AUTHENTICATED',
      status: 401,
    });
    new MaterialsExceptionFilter().catch(authErr, cap.host);
    expect(cap.status()).toBe(401);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('NOT_AUTHENTICATED');
  });

  it('maps an unknown error to 500 INTERNAL', () => {
    const cap = hostCapturing();
    const filter = new MaterialsExceptionFilter();
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    filter.catch(new Error('boom'), cap.host);
    expect(cap.status()).toBe(500);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('INTERNAL');
  });
});
