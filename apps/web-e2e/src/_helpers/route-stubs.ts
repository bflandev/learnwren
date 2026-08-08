import type { Page } from '@playwright/test';

export type RouteRole = 'guest' | 'student' | 'instructor' | 'admin';

/**
 * Both authGuard (libs/web-auth/src/lib/auth.guard.ts) and adminRoleGuard
 * (libs/web-admin/src/lib/admin-role.guard.ts) gate solely on
 * AuthService.refresh(), which is one GET /api/auth/me. Stubbing that single
 * endpoint therefore satisfies every guarded route at any role — no
 * emulators, no real session cookie.
 */
const USERS: Record<Exclude<RouteRole, 'guest'>, Record<string, unknown>> = {
  student: {
    uid: 'a11y-student',
    email: 'student@example.com',
    displayName: 'Sam Student',
    role: 'STUDENT',
    emailVerified: true,
  },
  instructor: {
    uid: 'a11y-instructor',
    email: 'instructor@example.com',
    displayName: 'Ingrid Instructor',
    role: 'INSTRUCTOR',
    emailVerified: true,
  },
  admin: {
    uid: 'a11y-admin',
    email: 'admin@example.com',
    displayName: 'Ada Admin',
    role: 'ADMIN',
    emailVerified: true,
  },
};

/** Stub GET /api/auth/me for the given role. `guest` returns 401. */
export async function stubAuth(page: Page, role: RouteRole): Promise<void> {
  await page.route('**/api/auth/me', (route) => {
    if (role === 'guest') {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'UNAUTHENTICATED' }),
      });
      return;
    }
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(USERS[role]),
    });
  });
}

/**
 * Fulfil a URL glob with a JSON body.
 *
 * `delayMs` exists for the performance suite: an instantly-fulfilled stub
 * makes the client render against an impossibly fast server, which flatters
 * the LCP measurement. The a11y and responsive sweeps pass nothing and keep
 * the old instant behaviour — they measure DOM, not time.
 */
export async function stubJson(
  page: Page,
  urlGlob: string,
  body: unknown,
  status = 200,
  delayMs = 0,
): Promise<void> {
  await page.route(urlGlob, async (route) => {
    if (delayMs > 0) {
      await new Promise((done) => setTimeout(done, delayMs));
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

// Playwright gotcha, load-bearing: route handlers match in REVERSE
// registration order. Register broad globs FIRST and specific paths LAST, or
// the glob shadows the specific route. admin-users.spec.ts:54 documents the
// same trap.
