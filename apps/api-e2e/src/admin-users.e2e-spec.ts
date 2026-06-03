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

async function seedPublishedCourse(instructorId: string): Promise<string> {
  const cid = `admin-users-e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  await admin.firestore().collection('courses').doc(cid).set({
    id: cid,
    title: 'Admin Users e2e course',
    description: 'course',
    instructorId,
    status: 'PUBLISHED',
    enrollmentCount: 0,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return cid;
}

test('admin lists users, searches, and opens a detail with enrollment + authored course', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const student = await registerStudent(ctx);
    const cid = await seedPublishedCourse(instructor.uid);
    const enroll = await ctx.post(`${API_BASE}/enrollments`, {
      headers: { Cookie: student.cookieHeader },
      data: { courseId: cid },
    });
    expect(enroll.status()).toBe(201);

    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    // List contract: shape + pagination. We do NOT assert a specific freshly-
    // created user appears on page 1 — the api-e2e emulator is shared across the
    // whole suite (and parallel runs), so page 1 (20 rows, sorted by name) is
    // not guaranteed to contain our student. Per-user data is verified via the
    // by-uid detail endpoint below, which is robust to dataset size.
    const list = await ctx.get(`${API_BASE}/admin/users`, { headers: hdr });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as {
      users: Array<{ id: string; email: string; role: string }>;
      total: number;
      pageSize: number;
      capped: boolean;
    };
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeLessThanOrEqual(body.pageSize);
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(typeof body.capped).toBe('boolean');

    // Search filter: a term that cannot match any name or email returns nothing.
    const search = await ctx.get(`${API_BASE}/admin/users?search=zzz-no-such-user-zzz`, {
      headers: hdr,
    });
    expect(search.status()).toBe(200);
    const sresult = (await search.json()) as { users: unknown[]; total: number };
    expect(sresult.users).toEqual([]);
    expect(sresult.total).toBe(0);

    const studentDetail = await ctx.get(`${API_BASE}/admin/users/${student.uid}`, { headers: hdr });
    expect(studentDetail.status()).toBe(200);
    const sd = (await studentDetail.json()) as {
      enrollments: Array<{ courseId: string; courseTitle: string }>;
    };
    expect(sd.enrollments.some((e) => e.courseId === cid)).toBe(true);

    const instructorDetail = await ctx.get(`${API_BASE}/admin/users/${instructor.uid}`, { headers: hdr });
    expect(instructorDetail.status()).toBe(200);
    const id = (await instructorDetail.json()) as {
      role: string;
      authoredCourses: Array<{ courseId: string }>;
    };
    expect(id.role).toBe('INSTRUCTOR');
    expect(id.authoredCourses.some((c) => c.courseId === cid)).toBe(true);
  } finally {
    await ctx.dispose();
  }
});

test('detail returns 404 USER_NOT_FOUND for an unknown uid', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.get(`${API_BASE}/admin/users/does-not-exist`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('USER_NOT_FOUND');
  } finally {
    await ctx.dispose();
  }
});

test('non-admin is forbidden from the user directory', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const res = await ctx.get(`${API_BASE}/admin/users`, {
      headers: { Cookie: instructor.cookieHeader },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

test('admin promotes a student to instructor', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    const res = await ctx.post(`${API_BASE}/admin/users/${student.uid}/promote`, { headers: hdr });
    expect(res.status()).toBe(201);
    expect((await res.json()).role).toBe('INSTRUCTOR');

    const detail = await ctx.get(`${API_BASE}/admin/users/${student.uid}`, { headers: hdr });
    expect((await detail.json()).role).toBe('INSTRUCTOR');
  } finally {
    await ctx.dispose();
  }
});

test('admin demotes an instructor to student', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    const res = await ctx.post(`${API_BASE}/admin/users/${instructor.uid}/demote`, { headers: hdr });
    expect(res.status()).toBe(201);
    expect((await res.json()).role).toBe('STUDENT');

    const detail = await ctx.get(`${API_BASE}/admin/users/${instructor.uid}`, { headers: hdr });
    expect((await detail.json()).role).toBe('STUDENT');
  } finally {
    await ctx.dispose();
  }
});

test('promote on a non-student is 409 INVALID_ROLE_TRANSITION', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(`${API_BASE}/admin/users/${instructor.uid}/promote`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('INVALID_ROLE_TRANSITION');
  } finally {
    await ctx.dispose();
  }
});

test('demote on a non-instructor is 409 INVALID_ROLE_TRANSITION', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const student = await registerStudent(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);
    const res = await ctx.post(`${API_BASE}/admin/users/${student.uid}/demote`, {
      headers: { Cookie: adminSession.cookieHeader },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('INVALID_ROLE_TRANSITION');
  } finally {
    await ctx.dispose();
  }
});

test('non-admin cannot promote or demote (403)', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const student = await registerStudent(ctx);
    const res = await ctx.post(`${API_BASE}/admin/users/${student.uid}/promote`, {
      headers: { Cookie: instructor.cookieHeader },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

// Skipped: the Firebase Auth emulator does not enforce session-cookie revocation
// (verifySessionCookie checkRevoked) the way production does — a cookie minted at
// ~the same second as revokeRefreshTokens' second-granularity validSince still
// verifies, so this returns 200 against the emulator. The revoke effect itself is
// covered by the unit assertion in role-mutation.spec.ts (revokeRefreshTokens is
// called on demote); immediate session invalidation is a manual-verify item against
// real Firebase. See the plan's Task 6 fallback note.
test.skip('demotion revokes the instructor session (next request 401) [timing-sensitive]', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const instructor = await registerAndPromoteInstructor(ctx);
    const adminSession = await registerAndPromoteAdmin(ctx);

    // The live instructor session can reach a FirebaseSessionGuard-protected route.
    const before = await ctx.get(`${API_BASE}/profile`, { headers: { Cookie: instructor.cookieHeader } });
    expect(before.status()).toBe(200);

    await ctx.post(`${API_BASE}/admin/users/${instructor.uid}/demote`, {
      headers: { Cookie: adminSession.cookieHeader },
    });

    // After revocation, the same cookie fails verifySessionCookie(checkRevoked=true).
    const after = await ctx.get(`${API_BASE}/profile`, { headers: { Cookie: instructor.cookieHeader } });
    expect(after.status()).toBe(401);
  } finally {
    await ctx.dispose();
  }
});
