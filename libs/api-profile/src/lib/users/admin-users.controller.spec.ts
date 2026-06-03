import { describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUsersController } from './admin-users.controller';
import type { AdminUsersService } from './admin-users.service';

describe('AdminUsersController', () => {
  it('list delegates to the service with parsed query params', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 2, pageSize: 10, capped: false })) };
    const ctrl = new AdminUsersController(svc as unknown as AdminUsersService);
    await ctrl.list('ada', '2', '10');
    expect(svc.list).toHaveBeenCalledWith('ada', 2, 10);
  });

  it('list defaults missing query params (search="", page=1, pageSize=20)', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: false })) };
    const ctrl = new AdminUsersController(svc as unknown as AdminUsersService);
    await ctrl.list(undefined, undefined, undefined);
    expect(svc.list).toHaveBeenCalledWith('', 1, 20);
  });

  it('getOne casts the route param to UserId and delegates', async () => {
    const detail = { id: 'u1' as UserId };
    const svc = { getDetail: vi.fn(async () => detail) };
    const ctrl = new AdminUsersController(svc as unknown as AdminUsersService);
    await ctrl.getOne('u1');
    expect(svc.getDetail).toHaveBeenCalledWith('u1');
  });
});
