import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:3333/api';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';

const uniqueEmail = () => `auth-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

async function signInViaAuthEmulator(email: string, password: string): Promise<string> {
  const url = `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { idToken: string };
  return body.idToken;
}

test('register → session → me → logout end-to-end against the emulator suite', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const displayName = 'E2E Tester';

  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(reg.status()).toBe(201);
  const regBody = await reg.json();
  expect(regBody.uid).toEqual(expect.any(String));
  expect(regBody.email).toBe(email);

  const dup = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).error.code).toBe('EMAIL_ALREADY_EXISTS');

  const idToken = await signInViaAuthEmulator(email, password);

  const session = await request.post(`${API_BASE}/auth/session`, {
    data: { idToken },
  });
  expect(session.status()).toBe(200);
  const sessionCookie = session.headers()['set-cookie'];
  expect(sessionCookie).toContain('__session=');
  expect(sessionCookie).toContain('HttpOnly');
  expect(sessionCookie).toContain('SameSite=Strict');

  const match = sessionCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  const cookieHeader = `__session=${match![1]}`;

  const me = await request.get(`${API_BASE}/auth/me`, {
    headers: { cookie: cookieHeader },
  });
  expect(me.status()).toBe(200);
  const meBody = await me.json();
  expect(meBody).toMatchObject({
    uid: regBody.uid,
    email,
    displayName,
    role: 'STUDENT',
  });

  const out = await request.post(`${API_BASE}/auth/logout`, {
    headers: { cookie: cookieHeader },
  });
  expect(out.status()).toBe(204);

  const meAfter = await request.get(`${API_BASE}/auth/me`, {
    headers: { cookie: cookieHeader },
  });
  expect(meAfter.status()).toBe(401);
});

test('register rejects a weak password with WEAK_PASSWORD and unmetRequirements', async ({ request }) => {
  const email = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'short', displayName: 'X' },
  });
  expect(reg.status()).toBe(400);
  const body = await reg.json();
  expect(body.error.code).toBe('WEAK_PASSWORD');
  expect(body.error.details.unmetRequirements).toContain('MIN_LENGTH');
});
