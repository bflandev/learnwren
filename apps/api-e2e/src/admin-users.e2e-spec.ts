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

    const list = await ctx.get(`${API_BASE}/admin/users`, { headers: hdr });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as {
      users: Array<{ id: string; email: string; role: string }>;
      total: number;
      capped: boolean;
    };
    expect(body.users.some((u) => u.id === student.uid)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.capped).toBe(false);

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
