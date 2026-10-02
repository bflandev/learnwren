import { expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import { seam } from './seam';

export const API_BASE = 'http://localhost:3333/api';

/**
 * Run `fn` with a request context that has a fresh, empty cookie jar — for
 * genuinely-unauthenticated probes. The shared Playwright `request` fixture
 * retains the `__session` cookie after any login in the same test, so a
 * header-less call on it travels authenticated and the endpoint never returns
 * 401. The throwaway context is always disposed, even if `fn` throws.
 */
export async function withAnonRequest<T>(
  fn: (anon: APIRequestContext) => Promise<T>,
): Promise<T> {
  const anon = await apiRequest.newContext();
  try {
    return await fn(anon);
  } finally {
    await anon.dispose();
  }
}

export const uniqueEmail = (prefix = 'e2e') =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

export interface SessionContext {
  uid: string;
  cookieHeader: string;
}

/**
 * POST to the api with retry-on-429. The Firebase Auth emulator applies a
 * per-IP rate limit on signUp; long suites (api-e2e has ~140 tests, many of
 * which register fresh users) hit it deterministically toward the tail. Retry
 * up to 3 times with 2s/4s/8s backoff.
 */
async function postWithRetryOn429(
  request: import('@playwright/test').APIRequestContext,
  url: string,
  body: unknown,
): Promise<import('@playwright/test').APIResponse> {
  let res = await request.post(url, { data: body });
  for (let attempt = 0; res.status() === 429 && attempt < 3; attempt += 1) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    res = await request.post(url, { data: body });
  }
  return res;
}

/** Register a STUDENT, mark verified, then promote to INSTRUCTOR and re-mint the session cookie. */
export async function registerAndPromoteInstructor(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail('instructor');
  const password = 'Aa1!aaaaaaaa';
  const reg = await postWithRetryOn429(request, `${API_BASE}/auth/register`, {
    email,
    password,
    displayName: 'I',
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };

  // Mark verified + promote to INSTRUCTOR via the test seam
  await seam.markEmailVerified(uid);
  await seam.setRole(uid, 'INSTRUCTOR');

  // Log in to get a fresh session cookie with the new claim
  const login = await postWithRetryOn429(request, `${API_BASE}/auth/login`, {
    email,
    password,
  });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  const cookieHeader = `__session=${match![1]}`;
  return { uid, cookieHeader };
}

export async function registerStudent(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail('student');
  const password = 'Aa1!aaaaaaaa';
  const reg = await postWithRetryOn429(request, `${API_BASE}/auth/register`, {
    email,
    password,
    displayName: 'S',
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  const setCookie = reg.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  return { uid, cookieHeader: `__session=${match![1]}` };
}

/** Register a STUDENT, mark verified, promote to ADMIN, and re-mint the session cookie. */
export async function registerAndPromoteAdmin(
  request: import('@playwright/test').APIRequestContext,
): Promise<SessionContext> {
  const email = uniqueEmail('admin');
  const password = 'Aa1!aaaaaaaa';
  const reg = await postWithRetryOn429(request, `${API_BASE}/auth/register`, {
    email,
    password,
    displayName: 'Adm',
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };

  await seam.markEmailVerified(uid);
  await seam.setRole(uid, 'ADMIN');

  const login = await postWithRetryOn429(request, `${API_BASE}/auth/login`, { email, password });
  expect(login.status()).toBe(200);
  const setCookie = login.headers()['set-cookie'];
  const match = setCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  return { uid, cookieHeader: `__session=${match![1]}` };
}

/**
 * Redeem an emailed action link the way a browser would. The Firebase emulator
 * applies the code on a GET of its hosted link; the local identity adapter's
 * link points at the web app, whose page posts mode+token to /auth/email-action.
 */
export async function redeemEmailLink(
  request: import('@playwright/test').APIRequestContext,
  url: string,
): Promise<void> {
  const link = new URL(url);
  if (link.searchParams.has('oobCode')) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect(res.status()).toBeLessThan(400);
    return;
  }
  const res = await request.post(`${API_BASE}/auth/email-action`, {
    data: { mode: link.searchParams.get('mode'), token: link.searchParams.get('token') },
  });
  expect(res.status()).toBe(204);
}
