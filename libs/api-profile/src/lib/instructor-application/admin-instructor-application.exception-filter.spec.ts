import { describe, it, expect, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';

import * as httpErrors from '@learnwren/api-http-errors';
import { AdminInstructorApplicationExceptionFilter } from './admin-instructor-application.exception-filter';
import { ApplicationNotFoundException } from './errors/admin-instructor-application.exception';

describe('AdminInstructorApplicationExceptionFilter', () => {
  it('delegates to handleException', () => {
    const spy = vi.spyOn(httpErrors, 'handleException').mockReturnValue(undefined as never);
    const filter = new AdminInstructorApplicationExceptionFilter();
    const host = {} as ArgumentsHost;
    const err = new ApplicationNotFoundException();

    filter.catch(err, host);

    expect(spy).toHaveBeenCalledWith(host, err, expect.anything());
    spy.mockRestore();
  });
});
