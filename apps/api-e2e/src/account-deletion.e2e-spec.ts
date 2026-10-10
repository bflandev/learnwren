import { expect, test } from '@playwright/test';

import { API_BASE, registerAndPromoteInstructor, uniqueEmail } from './_helpers/auth';
import { seam } from './_helpers/seam';

const PASSWORD = 'Aa1!aaaaaaaa';

async function registerVerifiedSession(
  request: import('@playwright/test').APIRequestContext,
): Promise<{ uid: string; email: string; cookieHeader: string }> {
  const email = uniqueEmail('selfdel');
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: PASSWORD, displayName: 'Doomed' },
  });
  expect(reg.status()).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await seam.markEmailVerified(uid);
  const login = await request.post(`${API_BASE}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(200);
  const match = login.headers()['set-cookie']!.match(/__session=([^;]+)/);
  return { uid, email, cookieHeader: `__session=${match![1]}` };
}

test('deletes the account (204), clears the cookie, anonymises the profile, and blocks login', async ({ request }) => {
  const { uid, email, cookieHeader } = await registerVerifiedSession(request);

  const res = await request.delete(`${API_BASE}/profile/account`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: PASSWORD },
  });
  expect(res.status()).toBe(204);
  expect(res.headers()['set-cookie']).toContain('Max-Age=0');

  const doc = await seam.getDoc<{ status: string; email?: string; displayName?: string }>(`users/${uid}`);
  expect(doc?.status).toBe('DELETED');
  expect(doc?.email).not.toBe(email);
  expect(doc?.displayName).not.toBe('Doomed');

  const login = await request.post(`${API_BASE}/auth/login`, { data: { email, password: PASSWORD } });
  expect(login.status()).toBe(401);
});

test('a wrong password is rejected with CURRENT_PASSWORD_INVALID and the account survives', async ({ request }) => {
  const { uid, cookieHeader } = await registerVerifiedSession(request);
  const res = await request.delete(`${API_BASE}/profile/account`, {
    headers: { Cookie: cookieHeader },
    data: { currentPassword: 'WrongPass1!' },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('CURRENT_PASSWORD_INVALID');
  const doc = await seam.getDoc<{ status?: string }>(`users/${uid}`);
  expect(doc?.status ?? 'ACTIVE').toBe('ACTIVE');
});

test('an instructor who owns a course is blocked with USER_HAS_COURSES', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const cid = `self-delete-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await seam.setDoc(`courses/${cid}`, {
    id: cid, title: 'Owned', description: 'c', instructorId: instructor.uid,
    status: 'DRAFT', enrollmentCount: 0, createdAt: now, updatedAt: now,
  });

  const res = await request.delete(`${API_BASE}/profile/account`, {
    headers: { Cookie: instructor.cookieHeader },
    data: { currentPassword: PASSWORD },
  });
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.error.code).toBe('USER_HAS_COURSES');
  expect(body.error.details.courseIds).toContain(cid);
});

test('an account mid-deletion cannot create a course (403 ACCOUNT_DELETED)', async ({ request }) => {
  // Simulates a delete that claimed the account but failed before revoking the
  // session: the live session must not be able to acquire a course.
  const instructor = await registerAndPromoteInstructor(request);
  await seam.updateDoc(`users/${instructor.uid}`, { status: 'DELETED' });

  const res = await request.post(`${API_BASE}/courses`, {
    headers: { Cookie: instructor.cookieHeader },
    data: { title: 'Sneaky', description: 'Created after the delete claim.' },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).error.code).toBe('ACCOUNT_DELETED');
  expect(await seam.query('courses', 'instructorId', instructor.uid)).toHaveLength(0);
});

test('without a session cookie the endpoint is rejected with 401', async ({ request }) => {
  const res = await request.delete(`${API_BASE}/profile/account`, { data: { currentPassword: PASSWORD } });
  expect(res.status()).toBe(401);
});
