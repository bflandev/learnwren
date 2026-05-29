// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { test, expect, request as apiRequest } from '@playwright/test';
import * as admin from 'firebase-admin';

import {
  API_BASE,
  initAdmin,
  registerStudent,
  registerAndPromoteInstructor,
  registerAndPromoteAdmin,
} from './_helpers/auth';

test.beforeAll(() => initAdmin());

async function applyAsStudent(
  request: import('@playwright/test').APIRequestContext,
  cookieHeader: string,
): Promise<void> {
  const res = await request.post(`${API_BASE}/profile/instructor-application`, {
    headers: { Cookie: cookieHeader },
    data: { statement: 'I want to teach', expertise: 'Mathematics' },
  });
  expect(res.status()).toBe(201);
}

test('admin sees, then approves, a pending application', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    await applyAsStudent(ctx, student.cookieHeader);
    await admin.auth().updateUser(student.uid, { emailVerified: true });

    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    const list = await ctx.get(`${API_BASE}/admin/instructor-applications`, { headers: hdr });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { applications: Array<{ uid: string; email: string }> };
    expect(body.applications.some((a) => a.uid === student.uid)).toBe(true);

    const approve = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/approve`,
      { headers: hdr },
    );
    expect(approve.status()).toBe(201);
    expect((await approve.json()).status).toBe('APPROVED');

    const again = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/approve`,
      { headers: hdr },
    );
    expect(again.status()).toBe(409);
    expect((await again.json()).error.code).toBe('APPLICATION_NOT_PENDING');

    const userDoc = await admin.firestore().collection('users').doc(student.uid).get();
    expect(userDoc.data()?.['role']).toBe('INSTRUCTOR');
  } finally {
    await ctx.dispose();
  }
});

test('approve is refused for an unverified applicant', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    await applyAsStudent(ctx, student.cookieHeader);

    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/approve`,
      { headers: { Cookie: adminSession.cookieHeader } },
    );
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('APPLICANT_NOT_VERIFIED');
  } finally {
    await ctx.dispose();
  }
});

test('non-admin is forbidden from the admin queue', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const res = await ctx.get(`${API_BASE}/admin/instructor-applications`, {
      headers: { Cookie: instructor.cookieHeader },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

test('admin can decline a pending application', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    await applyAsStudent(ctx, student.cookieHeader);

    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/decline`,
      { headers: { Cookie: adminSession.cookieHeader } },
    );
    expect(res.status()).toBe(201);
    expect((await res.json()).status).toBe('DECLINED');
  } finally {
    await ctx.dispose();
  }
});
