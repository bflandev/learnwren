import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  let get: ReturnType<typeof vi.fn>;
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    get = vi.fn(() => of({ users: [], total: 0, page: 1, pageSize: 20, capped: false }));
    post = vi.fn(() => of({ id: 'u1', role: 'INSTRUCTOR' }));
    TestBed.configureTestingModule({
      providers: [{ provide: HttpClient, useValue: { get, post } }],
    });
  });

  it('list() GETs /api/admin/users with search/page/pageSize params', async () => {
    const svc = TestBed.inject(AdminUsersService);
    await svc.list('ada', 2, 10);
    expect(get).toHaveBeenCalledWith('/api/admin/users', {
      params: { search: 'ada', page: '2', pageSize: '10' },
    });
  });

  it('getDetail() GETs /api/admin/users/:uid', async () => {
    get = vi.fn(() => of({ id: 'u1' }));
    TestBed.overrideProvider(HttpClient, { useValue: { get } });
    const svc = TestBed.inject(AdminUsersService);
    await svc.getDetail('u1');
    expect(get).toHaveBeenCalledWith('/api/admin/users/u1');
  });

  it('promote() POSTs /api/admin/users/:uid/promote', async () => {
    const svc = TestBed.inject(AdminUsersService);
    await svc.promote('u1');
    expect(post).toHaveBeenCalledWith('/api/admin/users/u1/promote', {});
  });

  it('demote() POSTs /api/admin/users/:uid/demote', async () => {
    post = vi.fn(() => of({ id: 'u1', role: 'STUDENT' }));
    TestBed.overrideProvider(HttpClient, { useValue: { get, post } });
    const svc = TestBed.inject(AdminUsersService);
    await svc.demote('u1');
    expect(post).toHaveBeenCalledWith('/api/admin/users/u1/demote', {});
  });
});
