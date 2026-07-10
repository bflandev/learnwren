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

interface CategoryBody {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Unique per run — the api-e2e emulator is shared across the suite and parallel runs. */
function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.floor(Math.random() * 1e6)}`;
}

test('public category list is available unauthenticated, seeded, and alphabetical', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const res = await ctx.get(`${API_BASE}/categories`);
    expect(res.status()).toBe(200);
    const cats = (await res.json()) as CategoryBody[];

    // Lazy seed: the six defaults exist on first read.
    const names = cats.map((c) => c.name);
    expect(names).toContain('Programming');
    expect(cats.find((c) => c.name === 'Programming')?.id).toBe('PROGRAMMING');

    // AC 3: alphabetical by display name.
    const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    expect(names).toEqual(sorted);
  } finally {
    await ctx.dispose();
  }
});

test('admin category endpoints reject unauthenticated and non-admin callers', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const anon = await ctx.post(`${API_BASE}/admin/categories`, { data: { name: 'X' } });
    expect(anon.status()).toBe(401);

    const student = await registerStudent(ctx);
    const asStudent = await ctx.post(`${API_BASE}/admin/categories`, {
      headers: { Cookie: student.cookieHeader },
      data: { name: 'X' },
    });
    expect(asStudent.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

test('admin creates, renames, and deletes categories with course reassignment', async () => {
  const ctx = await apiRequest.newContext();
  try {
    const adminSession = await registerAndPromoteAdmin(ctx);
    const hdr = { Cookie: adminSession.cookieHeader };

    // Create.
    const nameA = uniqueName('Wren Weaving');
    const created = await ctx.post(`${API_BASE}/admin/categories`, {
      headers: hdr,
      data: { name: nameA },
    });
    expect(created.status()).toBe(201);
    const catA = (await created.json()) as CategoryBody;
    expect(catA.name).toBe(nameA);
    expect(catA.id).toBe(nameA.toUpperCase().replace(/[^A-Z0-9]+/g, '_'));

    // Duplicate name → 409 CATEGORY_EXISTS.
    const dup = await ctx.post(`${API_BASE}/admin/categories`, {
      headers: hdr,
      data: { name: nameA.toLowerCase() },
    });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).error.code).toBe('CATEGORY_EXISTS');

    // Blank name → 400 VALIDATION_FAILED (validated in service, typed code).
    const blank = await ctx.post(`${API_BASE}/admin/categories`, {
      headers: hdr,
      data: { name: '   ' },
    });
    expect(blank.status()).toBe(400);
    expect((await blank.json()).error.code).toBe('VALIDATION_FAILED');

    // Rename keeps the id, changes the display name, appears in the public list.
    const nameARenamed = uniqueName('Wren Weaving Renamed');
    const renamed = await ctx.patch(`${API_BASE}/admin/categories/${catA.id}`, {
      headers: hdr,
      data: { name: nameARenamed },
    });
    expect(renamed.status()).toBe(200);
    expect(((await renamed.json()) as CategoryBody).name).toBe(nameARenamed);

    const publicList = (await (await ctx.get(`${API_BASE}/categories`)).json()) as CategoryBody[];
    expect(publicList.find((c) => c.id === catA.id)?.name).toBe(nameARenamed);

    // Rename an unknown id → 404.
    const renameMissing = await ctx.patch(`${API_BASE}/admin/categories/NO_SUCH_CATEGORY_E2E`, {
      headers: hdr,
      data: { name: uniqueName('Nope') },
    });
    expect(renameMissing.status()).toBe(404);
    expect((await renameMissing.json()).error.code).toBe('CATEGORY_NOT_FOUND');

    // An instructor's course can reference the category; a bogus one is rejected.
    const instructor = await registerAndPromoteInstructor(ctx);
    const courseRes = await ctx.post(`${API_BASE}/courses`, {
      headers: { Cookie: instructor.cookieHeader },
      data: { title: 'Categories e2e', description: 'course', category: catA.id },
    });
    expect(courseRes.status()).toBe(201);
    const courseId = ((await courseRes.json()) as { id: string }).id;

    const badCourse = await ctx.post(`${API_BASE}/courses`, {
      headers: { Cookie: instructor.cookieHeader },
      data: { title: 'Bad category', description: 'course', category: 'NO_SUCH_CATEGORY_E2E' },
    });
    // CATEGORY_NOT_FOUND maps to 404 everywhere (one code, one status).
    expect(badCourse.status()).toBe(404);
    expect((await badCourse.json()).error.code).toBe('CATEGORY_NOT_FOUND');

    // Delete while in use without reassignTo → 409 CATEGORY_IN_USE.
    const inUse = await ctx.delete(`${API_BASE}/admin/categories/${catA.id}`, { headers: hdr });
    expect(inUse.status()).toBe(409);
    const inUseBody = await inUse.json();
    expect(inUseBody.error.code).toBe('CATEGORY_IN_USE');
    expect(inUseBody.error.details.courseCount).toBe(1);

    // Delete with reassignTo moves the course, then removes the category.
    const nameB = uniqueName('Wren Restoration');
    const catB = (await (
      await ctx.post(`${API_BASE}/admin/categories`, { headers: hdr, data: { name: nameB } })
    ).json()) as CategoryBody;

    const deleted = await ctx.delete(
      `${API_BASE}/admin/categories/${catA.id}?reassignTo=${catB.id}`,
      { headers: hdr },
    );
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toEqual({ reassignedCourses: 1 });

    const courseDoc = await admin.firestore().collection('courses').doc(courseId).get();
    expect(courseDoc.data()?.['category']).toBe(catB.id);

    const afterDelete = (await (await ctx.get(`${API_BASE}/categories`)).json()) as CategoryBody[];
    expect(afterDelete.some((c) => c.id === catA.id)).toBe(false);

    // Delete an unknown id → 404.
    const deleteMissing = await ctx.delete(`${API_BASE}/admin/categories/NO_SUCH_CATEGORY_E2E`, {
      headers: hdr,
    });
    expect(deleteMissing.status()).toBe(404);

    // Cleanup: keep the shared emulator dataset tidy for other suites.
    await ctx.delete(`${API_BASE}/admin/categories/${catB.id}?reassignTo=OTHER`, { headers: hdr });
    await ctx.delete(`${API_BASE}/courses/${courseId}`, {
      headers: { Cookie: instructor.cookieHeader },
    });
  } finally {
    await ctx.dispose();
  }
});
