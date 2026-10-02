import { expect, test } from '@playwright/test';

import { API_BASE, redeemEmailLink, uniqueEmail } from './_helpers/auth';
import { seam } from './_helpers/seam';

const PASSWORD = 'Aa1!aaaaaaaa';

interface VerifiedSession {
  uid: string;
  email: string;
  cookieHeader: string;
}

async function registerVerifiedSession(
  request: import('@playwright/test').APIRequestContext,
): Promise<VerifiedSession> {
  const email = uniqueEmail('emailchg');
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: PASSWORD, displayName: 'E' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await seam.markEmailVerified(uid);
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  const cookieHeader = `__session=${match![1]}`;
  return { uid, email, cookieHeader };
}

test('initiate sends a verification email to the new address (202)', async ({ request }) => {
  const { email, cookieHeader } = await registerVerifiedSession(request);
  const newEmail = uniqueEmail('emailchg-new');

  const res = await request.post(`${API_BASE}/profile/email`, {
    headers: { Cookie: cookieHeader },
    data: { newEmail, currentPassword: PASSWORD },
  });
  expect(res.status()).toBe(202);

  // The old address still works — the swap has not happened yet.
  const stillOld = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(stillOld.status()).toBe(200);

  // The outbox should hold a verification email sent to the NEW address.
  const outbox = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(newEmail)}&kind=email-change`,
  );
  expect(outbox.status()).toBe(200);
  // An action link carries a one-time code: Firebase's oobCode or local's token.
  const params = new URL((await outbox.json()).url).searchParams;
  expect(params.get('oobCode') ?? params.get('token')).toBeTruthy();
});

test('wrong current password is rejected with CURRENT_PASSWORD_INVALID', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);

  const res = await request.post(`${API_BASE}/profile/email`, {
    headers: { Cookie: cookieHeader },
    data: { newEmail: uniqueEmail('emailchg-x'), currentPassword: 'WrongPass1!' },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('CURRENT_PASSWORD_INVALID');
});

test('an address already belonging to another account is rejected (409)', async ({ request }) => {
  const taken = await registerVerifiedSession(request);
  const mover = await registerVerifiedSession(request);

  const res = await request.post(`${API_BASE}/profile/email`, {
    headers: { Cookie: mover.cookieHeader },
    data: { newEmail: taken.email, currentPassword: PASSWORD },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error.code).toBe('EMAIL_ALREADY_IN_USE');
});

test('confirm finalizes the swap, forces re-login, and login follows the new address', async ({
  request,
}) => {
  const { uid, email, cookieHeader } = await registerVerifiedSession(request);
  const newEmail = uniqueEmail('emailchg-final');

  const init = await request.post(`${API_BASE}/profile/email`, {
    headers: { Cookie: cookieHeader },
    data: { newEmail, currentPassword: PASSWORD },
  });
  expect(init.status()).toBe(202);

  // The user clicks the verify-and-change link in the email sent to the new address.
  const link = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(newEmail)}&kind=email-change`,
  );
  expect(link.status()).toBe(200);
  await redeemEmailLink(request, (await link.json()).url);

  const confirm = await request.post(`${API_BASE}/profile/email/confirm`, {
    headers: { Cookie: cookieHeader },
  });
  if (process.env['LEARNWREN_IDENTITY'] === 'local') {
    // Local identity revokes every session when the link is redeemed, so the old
    // cookie is already dead here; users/{uid}.email syncs on the next login.
    expect(confirm.status()).toBe(401);
  } else {
    expect(confirm.status()).toBe(200);
    expect(await confirm.json()).toMatchObject({ changed: true, email: newEmail });
    // The server must clear the session cookie so the client is forced to re-login.
    expect(confirm.headers()['set-cookie']).toContain('Max-Age=0');
  }

  // New address now authenticates successfully.
  const newLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email: newEmail, password: PASSWORD },
  });
  expect(newLogin.status()).toBe(200);

  // Old address no longer works (Firebase has replaced it).
  const oldLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(oldLogin.status()).toBe(401);

  // The users doc reflects the new address.
  const doc = await seam.getDoc<{ email?: string }>(`users/${uid}`);
  expect(doc?.email).toBe(newEmail);
});

test('confirm is a no-op when nothing has swapped', async ({ request }) => {
  const { cookieHeader } = await registerVerifiedSession(request);

  const res = await request.post(`${API_BASE}/profile/email/confirm`, {
    headers: { Cookie: cookieHeader },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ changed: false });
});

test('confirm without a session cookie is rejected with 401 (not 500)', async ({ request }) => {
  const res = await request.post(`${API_BASE}/profile/email/confirm`);
  expect(res.status()).toBe(401);
});
