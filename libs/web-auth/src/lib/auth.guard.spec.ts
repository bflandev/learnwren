import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

function buildState(url: string): RouterStateSnapshot {
  return { url } as RouterStateSnapshot;
}

describe('authGuard', () => {
  it('triggers refresh when currentUser is undefined and allows when authenticated', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = {
      currentUser: vi.fn().mockReturnValueOnce(undefined).mockReturnValueOnce({ uid: 'a' }),
      refresh,
    } as unknown as AuthService;
    const router = { createUrlTree: vi.fn() } as unknown as Router;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, buildState('/secret')),
    );

    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it('redirects to /login with redirect query param when anonymous', async () => {
    const url = {} as UrlTree;
    const auth = {
      currentUser: vi.fn().mockReturnValue(null),
      refresh: vi.fn(),
    } as unknown as AuthService;
    const router = { createUrlTree: vi.fn(() => url) } as unknown as Router;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, buildState('/secret')),
    );

    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/secret' },
    });
    expect(result).toBe(url);
  });

  it('redirects to /login when refresh rejects with a non-401 failure', async () => {
    const url = {} as UrlTree;
    const auth = {
      currentUser: vi.fn().mockReturnValue(undefined),
      refresh: vi.fn(async () => {
        throw new Error('500');
      }),
    } as unknown as AuthService;
    const router = { createUrlTree: vi.fn(() => url) } as unknown as Router;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, buildState('/secret')),
    );

    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/secret' },
    });
    expect(result).toBe(url);
  });

  it('allows immediately when already authenticated and skips refresh', async () => {
    const refresh = vi.fn();
    const auth = {
      currentUser: vi.fn().mockReturnValue({ uid: 'a' }),
      refresh,
    } as unknown as AuthService;
    const router = { createUrlTree: vi.fn() } as unknown as Router;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, buildState('/secret')),
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });
});
