import { describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';

import { AdminUsersController } from './admin-users.controller';
import type { AdminUsersService } from './admin-users.service';
import type { AdminUserRoleService } from './admin-user-role.service';

describe('AdminUsersController', () => {
  it('list delegates to the service with parsed query params', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 2, pageSize: 10, capped: false })) };
    const ctrl = new AdminUsersController(
      svc as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
    );
    await ctrl.list('ada', '2', '10');
    expect(svc.list).toHaveBeenCalledWith('ada', 2, 10);
  });

  it('list defaults missing query params (search="", page=1, pageSize=20)', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: false })) };
    const ctrl = new AdminUsersController(
      svc as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
    );
    await ctrl.list(undefined, undefined, undefined);
    expect(svc.list).toHaveBeenCalledWith('', 1, 20);
  });

  it('getOne casts the route param to UserId and delegates', async () => {
    const detail = { id: 'u1' as UserId };
    const svc = { getDetail: vi.fn(async () => detail) };
    const ctrl = new AdminUsersController(
      svc as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
    );
    await ctrl.getOne('u1');
    expect(svc.getDetail).toHaveBeenCalledWith('u1');
  });

  it('promote delegates to the role service with the path uid', async () => {
    const roleSvc = {
      promote: vi.fn(async () => ({ id: 'u1', role: 'INSTRUCTOR' })),
      demote: vi.fn(),
    };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      roleSvc as unknown as AdminUserRoleService,
    );
    await ctrl.promote('u1');
    expect(roleSvc.promote).toHaveBeenCalledWith('u1');
  });

  it('demote delegates to the role service with the path uid', async () => {
    const roleSvc = {
      promote: vi.fn(),
      demote: vi.fn(async () => ({ id: 'u1', role: 'STUDENT' })),
    };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      roleSvc as unknown as AdminUserRoleService,
    );
    await ctrl.demote('u1');
    expect(roleSvc.demote).toHaveBeenCalledWith('u1');
  });
});
