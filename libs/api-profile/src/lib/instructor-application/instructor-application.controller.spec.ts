import { describe, expect, it, vi } from 'vitest';

import type { UserId } from '@learnwren/shared-data-models';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { InstructorApplicationController } from './instructor-application.controller';

const req = (role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN') =>
  ({ user: { uid: 'u1' as UserId, email: 'a@b.c', role, emailVerified: true } } as AuthenticatedRequest);

describe('InstructorApplicationController', () => {
  it('delegates GET to svc.getApplication(uid)', async () => {
    const svc = {
      getApplication: vi.fn().mockResolvedValue({ status: 'NONE' }),
      submit: vi.fn(),
    };
    const ctrl = new InstructorApplicationController(svc as never);
    const out = await ctrl.get(req('STUDENT'));
    expect(svc.getApplication).toHaveBeenCalledWith('u1');
    expect(out).toEqual({ status: 'NONE' });
  });

  it('delegates POST to svc.submit(uid, role, body)', async () => {
    const view = { status: 'PENDING', statement: 's', expertise: 'e', createdAt: 't' };
    const svc = { getApplication: vi.fn(), submit: vi.fn().mockResolvedValue(view) };
    const ctrl = new InstructorApplicationController(svc as never);
    const out = await ctrl.submit({ statement: 's', expertise: 'e' }, req('STUDENT'));
    expect(svc.submit).toHaveBeenCalledWith('u1', 'STUDENT', { statement: 's', expertise: 'e' });
    expect(out).toEqual(view);
  });
});
