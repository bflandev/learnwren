import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CategoriesExceptionFilter } from './categories.exception-filter';
import { CategoryNotFoundException } from './categories.exception';

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

describe('CategoriesExceptionFilter', () => {
  it('maps a CategoriesException to its code + status', () => {
    const cap = hostCapturing();
    new CategoriesExceptionFilter().catch(new CategoryNotFoundException(), cap.host);
    expect(cap.status()).toBe(404);
    expect(cap.body()).toEqual({
      error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found.' },
    });
  });

  it('renders a DTO BadRequestException as 400 VALIDATION_FAILED with fieldErrors (validation enabled)', () => {
    const cap = hostCapturing();
    new CategoriesExceptionFilter().catch(
      new BadRequestException({ message: ['name should not be empty'] }),
      cap.host,
    );
    expect(cap.status()).toBe(400);
    expect(cap.body()).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request body failed validation.',
        details: { fieldErrors: { name: ['name should not be empty'] } },
      },
    });
  });
});
