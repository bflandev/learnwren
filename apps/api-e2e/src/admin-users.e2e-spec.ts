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
