import { describe, expect, it, vi } from 'vitest';
import type { UserId } from '@learnwren/shared-data-models';
import type { AuthenticatedRequest } from '@learnwren/api-auth';

import { AdminUsersController } from './admin-users.controller';
import type { AdminUsersService } from './admin-users.service';
import type { AdminUserRoleService } from './admin-user-role.service';
import type { AdminUserStatusService } from './admin-user-status.service';
import type { AdminUserDeleteService } from './admin-user-delete.service';

function fakeReq(uid = 'actor'): AuthenticatedRequest {
  return { user: { uid: uid as UserId, email: '', role: 'ADMIN', emailVerified: true } } as AuthenticatedRequest;
}

describe('AdminUsersController', () => {
  it('list delegates to the service with parsed query params', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 2, pageSize: 10, capped: false })) };
    const ctrl = new AdminUsersController(
      svc as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
      {} as unknown as AdminUserStatusService,
      {} as unknown as AdminUserDeleteService,
    );
    await ctrl.list('ada', '2', '10');
    expect(svc.list).toHaveBeenCalledWith('ada', 2, 10);
  });

  it('list defaults missing query params (search="", page=1, pageSize=20)', async () => {
    const svc = { list: vi.fn(async () => ({ users: [], total: 0, page: 1, pageSize: 20, capped: false })) };
    const ctrl = new AdminUsersController(
      svc as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
      {} as unknown as AdminUserStatusService,
      {} as unknown as AdminUserDeleteService,
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
      {} as unknown as AdminUserStatusService,
      {} as unknown as AdminUserDeleteService,
    );
    await ctrl.getOne('u1');
    expect(svc.getDetail).toHaveBeenCalledWith('u1');
  });

  it('promote passes actorUid from req.user and target uid to roleSvc', async () => {
    const roleSvc = {
      promote: vi.fn(async () => ({ id: 'u1', role: 'INSTRUCTOR' })),
      demote: vi.fn(),
    };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      roleSvc as unknown as AdminUserRoleService,
      {} as unknown as AdminUserStatusService,
      {} as unknown as AdminUserDeleteService,
    );
    await ctrl.promote(fakeReq('actor'), 'u1');
    expect(roleSvc.promote).toHaveBeenCalledWith('actor', 'u1');
  });

  it('demote passes actorUid from req.user and target uid to roleSvc', async () => {
    const roleSvc = {
      promote: vi.fn(),
      demote: vi.fn(async () => ({ id: 'u1', role: 'STUDENT' })),
    };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      roleSvc as unknown as AdminUserRoleService,
      {} as unknown as AdminUserStatusService,
      {} as unknown as AdminUserDeleteService,
    );
    await ctrl.demote(fakeReq('actor'), 'u1');
    expect(roleSvc.demote).toHaveBeenCalledWith('actor', 'u1');
  });

  it('suspend passes actorUid from req.user and target uid to statusSvc', async () => {
    const statusSvc = { suspend: vi.fn(async () => ({ id: 'u2', status: 'SUSPENDED' })), unsuspend: vi.fn() };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
      statusSvc as unknown as AdminUserStatusService,
      {} as unknown as AdminUserDeleteService,
    );
    await ctrl.suspend(fakeReq('actor'), 'u2');
    expect(statusSvc.suspend).toHaveBeenCalledWith('actor', 'u2');
  });

  it('unsuspend passes actorUid from req.user and target uid to statusSvc', async () => {
    const statusSvc = { suspend: vi.fn(), unsuspend: vi.fn(async () => ({ id: 'u3', status: 'ACTIVE' })) };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
      statusSvc as unknown as AdminUserStatusService,
      {} as unknown as AdminUserDeleteService,
    );
    await ctrl.unsuspend(fakeReq('actor'), 'u3');
    expect(statusSvc.unsuspend).toHaveBeenCalledWith('actor', 'u3');
  });

  it('deleteUser passes actorUid from req.user and target uid to deleteSvc', async () => {
    const deleteSvc = { delete: vi.fn(async () => undefined) };
    const ctrl = new AdminUsersController(
      {} as unknown as AdminUsersService,
      {} as unknown as AdminUserRoleService,
      {} as unknown as AdminUserStatusService,
      deleteSvc as unknown as AdminUserDeleteService,
    );
    await ctrl.deleteUser(fakeReq('actor'), 'u4');
    expect(deleteSvc.delete).toHaveBeenCalledWith('actor', 'u4');
  });
});
