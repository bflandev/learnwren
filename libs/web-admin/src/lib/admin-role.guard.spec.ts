import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { adminRoleGuard } from './admin-role.guard';

function runGuard(): unknown {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/instructor-applications' } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => adminRoleGuard(route, state));
}

describe('adminRoleGuard', () => {
  let auth: { currentUser: ReturnType<typeof signal>; refresh: ReturnType<typeof vi.fn> };
  let router: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = {
      currentUser: signal<{ role: string } | null | undefined>(undefined),
      refresh: vi.fn(async () => undefined),
    };
    router = { createUrlTree: vi.fn((path: string[]) => ({ __path: path })) };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('allows ADMIN', async () => {
    auth.currentUser = signal({ role: 'ADMIN' }) as never;
    await expect(runGuard()).resolves.toBe(true);
  });

  it('redirects non-ADMIN to /dashboard', async () => {
    auth.currentUser = signal({ role: 'INSTRUCTOR' }) as never;
    await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('redirects unauthenticated to /login with redirect param', async () => {
    auth.currentUser = signal(null) as never;
    await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(
      ['/login'],
      { queryParams: { redirect: '/admin/instructor-applications' } },
    );
  });

  it('refreshes when currentUser is undefined, then allows ADMIN', async () => {
    auth.refresh = vi.fn(async () => {
      auth.currentUser = signal({ role: 'ADMIN' }) as never;
    });
    await expect(runGuard()).resolves.toBe(true);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });
});
