// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';

import { API_BASE } from './_helpers/auth';

// Regression lock (N5): ProfileExceptionFilter must @Catch AuthException so an
// unauthenticated request to a FirebaseSessionGuard-protected route renders 401,
// not a 500. AuthException extends Error (not HttpException) and there is no
// global APP_FILTER, so a missing @Catch entry would leak the guard rejection as
// a 500 — masking the real status from clients and 4xx/5xx alerting.
test('GET /profile without a session cookie returns 401, not 500', async ({ request }) => {
  const res = await request.get(`${API_BASE}/profile`);
  expect(res.status()).toBe(401);
});

test('PATCH /profile without a session cookie returns 401, not 500', async ({ request }) => {
  const res = await request.patch(`${API_BASE}/profile`, { data: { displayName: 'x' } });
  expect(res.status()).toBe(401);
});
