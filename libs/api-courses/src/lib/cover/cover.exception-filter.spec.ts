import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, NotFoundException } from '@nestjs/common';

import { CoverDimensionsTooSmallException, CoverException } from './errors/cover.exception';
import { CoverExceptionFilter } from './cover.exception-filter';

function makeHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('CoverExceptionFilter', () => {
  it('maps a CoverException to its status + machine code + details', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new CoverDimensionsTooSmallException({ width: 800, height: 600 }), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'COVER_DIMENSIONS_TOO_SMALL',
        message: 'Cover image must be JPEG or PNG, at least 1280x720 pixels.',
        details: { width: 800, height: 600 },
      },
    });
  });

  it('passes through plain HttpException with a status-derived code', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new NotFoundException('Course not found.'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Course not found.' },
    });
  });

  it('falls back to 500 INTERNAL for unknown errors', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});
