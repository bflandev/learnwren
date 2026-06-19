import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { landingGuard } from './landing.guard';

function run(auth: Partial<AuthService>, router: Partial<Router>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    landingGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('landingGuard', () => {
  it('allows the landing page for an anonymous visitor', async () => {
    const auth = {
      currentUser: vi.fn().mockReturnValue(null),
      isAuthenticated: vi.fn().mockReturnValue(false),
      refresh: vi.fn(),
    } as unknown as AuthService;
    const result = await run(auth, { createUrlTree: vi.fn() } as unknown as Router);
    expect(result).toBe(true);
  });

  it('refreshes when the session is unknown, then allows if still anonymous', async () => {
    const refresh = vi.fn(async () => undefined);
    const auth = {
      currentUser: vi.fn().mockReturnValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(false),
      refresh,
    } as unknown as AuthService;
    const result = await run(auth, { createUrlTree: vi.fn() } as unknown as Router);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it('redirects an authenticated user to /dashboard', async () => {
    const tree = {} as UrlTree;
    const createUrlTree = vi.fn().mockReturnValue(tree);
    const auth = {
      currentUser: vi.fn().mockReturnValue({ uid: 'a' }),
      isAuthenticated: vi.fn().mockReturnValue(true),
      refresh: vi.fn(),
    } as unknown as AuthService;
    const result = await run(auth, { createUrlTree } as unknown as Router);
    expect(createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe(tree);
  });
});
