// NOTE: Run `pnpm emulators` and `pnpm start:api` before executing this suite.
import { test, expect, request as apiRequest } from '@playwright/test';

import {
  API_BASE,
  registerStudent,
  registerAndPromoteInstructor,
  registerAndPromoteAdmin,
} from './_helpers/auth';
import { seam } from './_helpers/seam';

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
    await seam.markEmailVerified(student.uid);

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

    const userDoc = await seam.getDoc(`users/${student.uid}`);
    expect(userDoc?.['role']).toBe('INSTRUCTOR');
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

test('decline records an optional reason that the admin history and the applicant both see', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    await applyAsStudent(ctx, student.cookieHeader);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    const tooLong = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/decline`,
      { headers: hdr, data: { reason: 'x'.repeat(2001) } },
    );
    expect(tooLong.status()).toBe(400);
    expect((await tooLong.json()).error.code).toBe('DECLINE_REASON_INVALID');

    const res = await ctx.post(
      `${API_BASE}/admin/instructor-applications/${student.uid}/decline`,
      { headers: hdr, data: { reason: '  Add a sample syllabus.  ' } },
    );
    expect(res.status()).toBe(201);
    expect((await res.json()).declineReason).toBe('Add a sample syllabus.');

    const history = await ctx.get(`${API_BASE}/admin/instructor-applications?status=DECLINED`, {
      headers: hdr,
    });
    expect(history.status()).toBe(200);
    const rows = ((await history.json()) as {
      applications: Array<{ uid: string; status: string; resolvedAt?: string; declineReason?: string }>;
    }).applications;
    const mine = rows.find((a) => a.uid === student.uid);
    expect(mine?.status).toBe('DECLINED');
    expect(mine?.resolvedAt).toBeTruthy();
    expect(mine?.declineReason).toBe('Add a sample syllabus.');

    const pending = await ctx.get(`${API_BASE}/admin/instructor-applications`, { headers: hdr });
    const pendingRows = ((await pending.json()) as { applications: Array<{ uid: string }> }).applications;
    expect(pendingRows.some((a) => a.uid === student.uid)).toBe(false);

    const own = await ctx.get(`${API_BASE}/profile/instructor-application`, {
      headers: { Cookie: student.cookieHeader },
    });
    expect((await own.json()).declineReason).toBe('Add a sample syllabus.');

    // Re-applying overwrites the doc, so the old reason no longer shows.
    await applyAsStudent(ctx, student.cookieHeader);
    const after = await ctx.get(`${API_BASE}/profile/instructor-application`, {
      headers: { Cookie: student.cookieHeader },
    });
    const afterBody = await after.json();
    expect(afterBody.status).toBe('PENDING');
    expect(afterBody.declineReason).toBeUndefined();
  } finally {
    await ctx.dispose();
  }
});

test('an unknown status filter is a typed 400', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.get(`${API_BASE}/admin/instructor-applications?status=NONE`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_STATUS_FILTER');
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
