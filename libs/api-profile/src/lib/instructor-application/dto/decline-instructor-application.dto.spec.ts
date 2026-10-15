import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DeclineInstructorApplicationDto } from './decline-instructor-application.dto';

// Same options as the global APP_PIPE in apps/api app.module.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const meta = { type: 'body' as const, metatype: DeclineInstructorApplicationDto };

describe('DeclineInstructorApplicationDto', () => {
  it('lets reason through the whitelisting pipe untouched (type checks live in the service)', async () => {
    await expect(pipe.transform({ reason: 42 }, meta)).resolves.toEqual({ reason: 42 });
  });

  it('rejects any other field', async () => {
    await expect(pipe.transform({ reason: 'x', extra: 1 }, meta)).rejects.toBeInstanceOf(BadRequestException);
  });
});
