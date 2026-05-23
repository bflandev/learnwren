import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';

const API_BASE = 'http://localhost:3333/api';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

async function markEmailVerified(uid: string): Promise<void> {
  await admin.auth().updateUser(uid, { emailVerified: true });
}

async function readUnlockTokenFromOutbox(
  request: { get: (url: string) => Promise<{ status: () => number; json: () => Promise<{ url: string }> }> },
  email: string,
): Promise<string | null> {
  const res = await request.get(
    `${API_BASE}/auth/_test/last-email?to=${encodeURIComponent(email)}&kind=unlock`,
  );
  if (res.status() !== 200) return null;
  const body = await res.json();
  const match = body.url.match(/[?&]token=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const emailHash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

const uniqueEmail = () => `auth-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

test('register → me → logout end-to-end (cookie set on register)', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const displayName = 'E2E Tester';

  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(reg.status()).toBe(201);
  const regBody = await reg.json();
  expect(regBody).toMatchObject({ email, role: 'STUDENT', emailVerified: false });
  expect(regBody.uid).toEqual(expect.any(String));

  const sessionCookie = reg.headers()['set-cookie'];
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
    emailVerified: false,
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

test('register rejects duplicate email with EMAIL_ALREADY_EXISTS', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const displayName = 'Dup';
  const first = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(first.status()).toBe(201);

  const dup = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).error.code).toBe('EMAIL_ALREADY_EXISTS');
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

test('lockout flow: 3 wrong passwords → 423 → unlock token works → login succeeds', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'Locker' },
  });
  expect(reg.status()).toBe(201);
  await markEmailVerified((await reg.json()).uid);

  for (let i = 0; i < 2; i++) {
    const r = await request.post(`${API_BASE}/auth/login`, {
      data: { email, password: 'wrong-1!aaaaaaa' },
    });
    expect(r.status()).toBe(401);
    expect((await r.json()).error.code).toBe('INVALID_CREDENTIALS');
  }

  const third = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: 'wrong-1!aaaaaaa' },
  });
  expect(third.status()).toBe(423);
  expect((await third.json()).error.code).toBe('ACCOUNT_LOCKED');

  const attempt = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  expect(attempt.status()).toBe(423);

  const unlockToken = await readUnlockTokenFromOutbox(request, email);
  expect(unlockToken).toBeTruthy();
  // The plaintext token must NOT be persisted to Firestore — only its hash.
  const snap = await admin.firestore().collection('auth_attempts').doc(emailHash(email)).get();
  const stored = snap.data() as { unlockToken?: string; unlockTokenHash?: string };
  expect(stored?.unlockToken).toBeUndefined();
  expect(stored?.unlockTokenHash).toBeTruthy();
  expect(stored?.unlockTokenHash).not.toBe(unlockToken);

  const unlock = await request.post(`${API_BASE}/auth/unlock`, {
    data: { token: unlockToken },
  });
  expect(unlock.status()).toBe(204);

  const ok = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(ok.status()).toBe(200);
});

test('verification gate: unverified login → 403 → flip emailVerified → 200', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'Gated' },
  });
  expect(reg.status()).toBe(201);

  const blocked = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('EMAIL_NOT_VERIFIED');

  await markEmailVerified((await reg.json()).uid);

  const ok = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(ok.status()).toBe(200);
});

test('resend-verification throttle: second call within 60s returns 429', async ({ request }) => {
  const email = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Aa1!aaaaaaaa', displayName: 'R' },
  });
  expect(reg.status()).toBe(201);

  const first = await request.post(`${API_BASE}/auth/resend-verification`, { data: { email } });
  expect(first.status()).toBe(202);

  const second = await request.post(`${API_BASE}/auth/resend-verification`, { data: { email } });
  expect(second.status()).toBe(429);
});

test('password-reset request: returns 202 for any email', async ({ request }) => {
  const email = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Aa1!aaaaaaaa', displayName: 'Reset' },
  });
  expect(reg.status()).toBe(201);

  const real = await request.post(`${API_BASE}/auth/request-password-reset`, { data: { email } });
  expect(real.status()).toBe(202);

  const ghost = await request.post(`${API_BASE}/auth/request-password-reset`, {
    data: { email: 'nobody-' + email },
  });
  expect(ghost.status()).toBe(202);
});

test('reset request does NOT clear an active lockout', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'L+R' },
  });
  expect(reg.status()).toBe(201);
  await markEmailVerified((await reg.json()).uid);

  for (let i = 0; i < 3; i++) {
    await request.post(`${API_BASE}/auth/login`, {
      data: { email, password: 'wrong-1!aaaaaaa' },
    });
  }

  const reset = await request.post(`${API_BASE}/auth/request-password-reset`, { data: { email } });
  expect(reset.status()).toBe(202);

  const stillLocked = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(stillLocked.status()).toBe(423);
});

test('enumeration resistance: ghost email and unverified email yield identical login responses', async ({ request }) => {
  const ghost = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'ghost-' + uniqueEmail(), password: 'Aa1!aaaaaaaa' },
  });
  expect(ghost.status()).toBe(401);
  expect((await ghost.json()).error.code).toBe('INVALID_CREDENTIALS');

  // An unverified extant user with a wrong password also reports INVALID_CREDENTIALS
  // (the verification gate is checked AFTER the password is verified correct).
  const realEmail = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email: realEmail, password: 'Aa1!aaaaaaaa', displayName: 'X' },
  });
  expect(reg.status()).toBe(201);
  const wrong = await request.post(`${API_BASE}/auth/login`, {
    data: { email: realEmail, password: 'definitely-Wrong-1!' },
  });
  expect(wrong.status()).toBe(401);
  expect((await wrong.json()).error.code).toBe('INVALID_CREDENTIALS');
});
