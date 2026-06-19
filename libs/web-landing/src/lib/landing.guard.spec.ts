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
    expect(auth.refresh).not.toHaveBeenCalled();
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
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('shows the landing page when the session refresh fails (e.g. api 5xx)', async () => {
    // The landing page is the public front door: a failed /auth/me (anything
    // other than a clean 401 — api 5xx, cold start, network blip) must not
    // blank the page. Treat an unresolvable session as anonymous and render.
    const refresh = vi.fn(async () => {
      throw new Error('api unavailable');
    });
    const createUrlTree = vi.fn();
    const auth = {
      currentUser: vi.fn().mockReturnValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(false),
      refresh,
    } as unknown as AuthService;
    const result = await run(auth, { createUrlTree } as unknown as Router);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result).toBe(true);
    expect(createUrlTree).not.toHaveBeenCalled();
  });
});
