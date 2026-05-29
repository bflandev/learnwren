import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

import { API_BASE, initAdmin, uniqueEmail } from './_helpers/auth';

initAdmin();

const PASSWORD = 'Aa1!aaaaaaaa';
const NEW_PASSWORD = 'Bb2@bbbbbbbb';

interface VerifiedSession {
  uid: string;
  email: string;
  cookieHeader: string;
}

async function registerVerifiedSession(
  request: import('@playwright/test').APIRequestContext,
): Promise<VerifiedSession> {
  const email = uniqueEmail('pwchg');
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: PASSWORD, displayName: 'P' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  return { uid, email, cookieHeader: `__session=${match![1]}` };
}

test('changes the password, clears the cookie (204), and login follows the new password', async ({ request }) => {
  const { email, cookieHeader } = await registerVerifiedSession(request);

  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  expect(res.status()).toBe(204);
  expect(res.headers()['set-cookie']).toContain('Max-Age=0');

  const outbox = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(email)}&kind=password-changed`,
  );
  expect(outbox.status()).toBe(200);

  const newLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: NEW_PASSWORD },
  });
  expect(newLogin.status()).toBe(200);

  const oldLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(oldLogin.status()).toBe(401);
});

test('wrong current password is rejected with CURRENT_PASSWORD_INVALID', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: 'WrongPass1!', newPassword: NEW_PASSWORD },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('CURRENT_PASSWORD_INVALID');
});

test('a weak new password is rejected with NEW_PASSWORD_WEAK and unmet requirements', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: PASSWORD, newPassword: 'short' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe('NEW_PASSWORD_WEAK');
  expect(Array.isArray(body.error.details.unmetRequirements)).toBe(true);
});

test('reusing the current password is rejected with PASSWORD_UNCHANGED', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);
  const res = await request.post(`${API_BASE}/profile/password`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: PASSWORD, newPassword: PASSWORD },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('PASSWORD_UNCHANGED');
});

test('without a session cookie the endpoint is rejected with 401 (not 500)', async ({ request }) => {
  const res = await request.post(`${API_BASE}/profile/password`, {
    data: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  expect(res.status()).toBe(401);
});
