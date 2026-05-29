import { describe, expect, it, vi } from 'vitest';

import { InstructorApplicationExceptionFilter } from './instructor-application.exception-filter';
import { InstructorApplicationInvalidException } from './errors/instructor-application.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as never;
  return { host, status, json };
}

describe('InstructorApplicationExceptionFilter', () => {
  it('renders a domain exception as { error: { code, message, details } } with its status', () => {
    const { host, status, json } = mockHost();
    new InstructorApplicationExceptionFilter().catch(
      new InstructorApplicationInvalidException('statement'),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INSTRUCTOR_APPLICATION_INVALID',
        message: 'A statement of intent is required (max 2000 characters).',
        details: { field: 'statement' },
      },
    });
  });
});
