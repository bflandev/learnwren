import { describe, it, expect, vi } from 'vitest';

import { AdminInstructorApplicationController } from './admin-instructor-application.controller';

describe('AdminInstructorApplicationController', () => {
  const svc = {
    listPending: vi.fn(async () => ({ applications: [] })),
    approve: vi.fn(async () => ({ status: 'APPROVED' })),
    decline: vi.fn(async () => ({ status: 'DECLINED' })),
  };
  const ctrl = new AdminInstructorApplicationController(svc as never);

  it('list delegates to listPending', async () => {
    await ctrl.list();
    expect(svc.listPending).toHaveBeenCalled();
  });

  it('approve passes the uid param', async () => {
    await ctrl.approve('u1');
    expect(svc.approve).toHaveBeenCalledWith('u1');
  });

  it('decline passes the uid param', async () => {
    await ctrl.decline('u1');
    expect(svc.decline).toHaveBeenCalledWith('u1');
  });
});
