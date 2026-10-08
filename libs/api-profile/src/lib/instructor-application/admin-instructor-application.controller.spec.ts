import { describe, it, expect, vi } from 'vitest';

import { AdminInstructorApplicationController } from './admin-instructor-application.controller';

describe('AdminInstructorApplicationController', () => {
  const svc = {
    list: vi.fn(async () => ({ applications: [] })),
    approve: vi.fn(async () => ({ status: 'APPROVED' })),
    decline: vi.fn(async () => ({ status: 'DECLINED' })),
  };
  const ctrl = new AdminInstructorApplicationController(svc as never);

  it('list passes the status query through', async () => {
    await ctrl.list('DECLINED');
    expect(svc.list).toHaveBeenCalledWith('DECLINED');
  });

  it('approve passes the uid param', async () => {
    await ctrl.approve('u1');
    expect(svc.approve).toHaveBeenCalledWith('u1');
  });

  it('decline passes the uid param and body', async () => {
    await ctrl.decline('u1', { reason: 'r' });
    expect(svc.decline).toHaveBeenCalledWith('u1', { reason: 'r' });
  });

  it('decline tolerates a missing body', async () => {
    await ctrl.decline('u1', undefined);
    expect(svc.decline).toHaveBeenCalledWith('u1', {});
  });
});
