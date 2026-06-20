import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { instructorRoleGuard } from './instructor-role.guard';

function runGuard(): unknown {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/courses' } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => instructorRoleGuard(route, state));
}

describe('instructorRoleGuard', () => {
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

  it('allows INSTRUCTOR without re-refreshing an already-loaded user', async () => {
    auth.currentUser = signal({ role: 'INSTRUCTOR' }) as never;
    await expect(runGuard()).resolves.toBe(true);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('redirects STUDENT to /dashboard', async () => {
    auth.currentUser = signal({ role: 'STUDENT' }) as never;
    const tree = await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(tree).toEqual({ __path: ['/dashboard'] });
  });

  it('redirects unauthenticated to /login with redirect query', async () => {
    auth.currentUser = signal(null) as never;
    const tree = await runGuard();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/courses' },
    });
    expect(tree).toEqual(expect.objectContaining({ __path: ['/login'] }));
  });

  it('calls refresh() when currentUser is undefined, then re-evaluates', async () => {
    auth.refresh = vi.fn(async () => {
      auth.currentUser = signal({ role: 'INSTRUCTOR' }) as never;
    });
    await expect(runGuard()).resolves.toBe(true);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });
});
