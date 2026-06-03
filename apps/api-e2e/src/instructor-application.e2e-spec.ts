// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { expect, test } from '@playwright/test';

import { API_BASE } from './_helpers/auth';

// Regression lock (N4): InstructorApplicationExceptionFilter must @Catch
// AuthException so an unauthenticated request to the FirebaseSessionGuard-
// protected non-admin endpoint renders 401, not a 500 (the admin endpoint is
// covered separately by instructor-application-admin.e2e-spec.ts).
test('GET /profile/instructor-application without a session cookie returns 401, not 500', async ({
  request,
}) => {
  const res = await request.get(`${API_BASE}/profile/instructor-application`);
  expect(res.status()).toBe(401);
});

test('POST /profile/instructor-application without a session cookie returns 401, not 500', async ({
  request,
}) => {
  const res = await request.post(`${API_BASE}/profile/instructor-application`, {
    data: { statement: 's', expertise: 'e' },
  });
  expect(res.status()).toBe(401);
});
